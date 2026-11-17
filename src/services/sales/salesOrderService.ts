// ============================================================================
// SALES ORDER SERVICE — Service quản lý Đơn hàng bán quốc tế
// File: src/services/sales/salesOrderService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
import { isVnd, orderTotals, toUsdEquivalent, vndRateError } from './salesMoney'
import { balesFromTons, containersFromBales, defaultBalesPerContainer } from './baleMath'
import type {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderContainer,
  ContainerType,
  Incoterm,
  PackingType,
  PaymentTerms,
  SalesOrderStatusLog,
  SalesOrderItem,
  SalesOrderParentRef,
  SalesOrderShipTo,
} from './salesTypes'
import { ORDER_STATUS_LABELS, soDisplayCode, normalizeContractNo, partyShortName } from './salesTypes'
import { addDaysStr, todayVN } from '../../utils/dateVN'

// ============================================================================
// TYPES
// ============================================================================

export interface CreateSalesOrderData {
  customer_id: string
  customer_po?: string
  grade: string
  quantity_tons: number
  unit_price: number
  currency?: string
  exchange_rate?: number
  incoterm?: Incoterm
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
  packing_type?: PackingType
  bale_weight_kg?: number
  shrink_wrap?: boolean
  pallet_required?: boolean
  marking_instructions?: string
  packing_note?: string

  // Vận chuyển
  container_type?: ContainerType
  shipping_line?: string
  vessel_name?: string
  booking_reference?: string

  // Ngày tháng
  order_date?: string
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

  // Hợp đồng (v4)
  contract_no?: string
  contract_date?: string
  commission_pct?: number
  commission_usd_per_mt?: number
  commission_amount?: number
  bank_account?: string
  bank_swift?: string
  bank_name?: string
  bales_per_container?: number

  // Ghi chú
  notes?: string
  internal_notes?: string

  // Cột sẵn có, gửi kiểu safe-key (chỉ khi có giá trị) — đơn mua tiếp chép từ đơn nguồn (continuationPrefill)
  port_of_discharge?: string
  pallets_per_container?: number
  bales_per_pallet?: number
  shipping_marks?: string
  item_no?: string
  packing_desc?: string
  proforma_date?: string
  bank_full_name?: string
  bank_address?: string

  // Họ HĐ + Các bên của đơn (sales_family_parties_p1.sql) — safe-key: chỉ gửi khi đã migration VÀ có giá trị.
  // ⚠ continuation_seq KHÔNG nhận từ client: trigger trg_so_family_guard cấp dưới khoá, đọc lại sau khi lưu.
  /** Đơn GỐC (đợt mua tiếp) — dùng createContinuation, đừng tự gán ở form HĐ mới. */
  parent_order_id?: string | null
  /** Ô CONTRACT NO. in số HĐ gốc (mặc định DB = true). */
  docs_cite_root?: boolean
  /** Người nhận hàng; = người mua hoặc rỗng → lưu NULL. */
  ship_to_customer_id?: string | null
  consignee_name?: string | null
  consignee_address?: string | null
  notify_party?: string | null
  notify_address?: string | null

  // Multi-item (v5)
  items?: Array<{
    grade: string
    quantity_tons: number
    unit_price: number
    currency?: string
    payment_terms?: string
    bale_weight_kg?: number
    bale_weights_kg?: number[]
    bales_per_container?: number
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
  }>
}

/**
 * Cột ĐƯỢC PHÉP sắp xếp ở tầng DB. Mọi giá trị khác rơi về 'order_date'.
 *
 * VÌ SAO CẦN: `sort_by` đi thẳng từ client vào `.order()` — qua tham số URL hoặc qua
 * bộ lọc lưu sẵn (JSONB trong user_saved_views, không hề được kiểm). Tên cột không tồn
 * tại thì PostgREST trả 400, danh sách không cập nhật được, người dùng chỉ thấy toast đỏ
 * không hiểu vì sao. Đặc biệt nguy hiểm với cột CHỈ CÓ Ở CLIENT — delivered_tons,
 * shortage, lot_progress — chúng không có trong DB.
 */
export const SORTABLE_ORDER_COLUMN_LIST = [
  'order_date', 'created_at', 'updated_at', 'code', 'id',
  'contract_no', 'contract_no_sort_key', 'customer_id', 'grade', 'customer_po',
  'quantity_tons', 'delivery_date', 'ready_date', 'bank_name', 'incoterm', 'booking_reference',
  'etd', 'unit_price', 'total_value_usd', 'deposit_amount', 'discount_amount',
  'discount_bank', 'remaining_amount', 'payment_received_date',
  'status', 'payment_status', 'current_stage',
] as const

/**
 * Dùng kiểu này cho mọi bảng ánh xạ cột→DB ở tầng UI. Khi đó thêm một tên cột không có
 * trong danh sách là `tsc` đỏ NGAY TẠI CHỖ, thay vì service âm thầm hạ xuống 'order_date'
 * — kịch bản tệ hơn cả lỗi cũ, vì dữ liệu sắp theo NGÀY ĐẶT trong khi mũi tên vẫn chỉ
 * đúng cột người dùng vừa bấm. Không lỗi, không toast, build vẫn xanh.
 */
export type SortableOrderColumn = typeof SORTABLE_ORDER_COLUMN_LIST[number]

export const SORTABLE_ORDER_COLUMNS: ReadonlySet<string> = new Set(SORTABLE_ORDER_COLUMN_LIST)

export interface SalesOrderListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: SalesOrderStatus | 'all'
  customer_id?: string
  grade?: string
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  overdue_etd_only?: boolean   // chỉ show đơn quá ETD chưa giao
  /** Lọc theo ETD (ngày tàu chạy) 'YYYY-MM-DD' — lịch giao ở Dashboard truyền ?etd=… (KHÁC date_from/to = ngày đặt) */
  etd_from?: string
  etd_to?: string
  // ── Họ HĐ + Các bên (bỏ qua khi chưa migration sales_family_parties_p1) ──
  /** 'new' = HĐ mới (không có đơn gốc) · 'continuation' = đơn mua tiếp · 'all'/trống = tất cả. */
  order_kind?: 'all' | 'new' | 'continuation'
  /** Vai của `customer_id` trong lọc: 'buyer' (mặc định — người mua, tổng như cũ) · 'receiver' (người nhận) · 'both'. */
  customer_role?: 'buyer' | 'receiver' | 'both'
  /** id ĐƠN GỐC: chỉ gốc + các đợt mua tiếp của nó (chip "HĐ gốc: …"). */
  family_root?: string
}

export interface SalesOrderStats {
  total: number
  draft: number
  confirmed: number
  producing: number
  ready: number
  packing: number
  shipped: number
  delivered: number
  invoiced: number
  paid: number
  overdue_etd: number          // đơn active chưa giao mà ETD đã qua
  total_value_usd_month: number
  orders_this_month: number
}

// ============================================================================
// CUSTOMER JOIN — dùng chung cho tất cả query cần join khách hàng
// ============================================================================

// NOTE: address + phone cần thiết để render contract SC/PI (buyer_address, buyer_phone)
const CUSTOMER_JOIN = 'customer:sales_customers!customer_id(id,code,name,short_name,country,tier,address,phone)'
const ITEMS_JOIN = 'items:sales_order_items!sales_order_items_sales_order_id_fkey(*)'
const OWNER_JOIN = 'current_owner:employees!sales_orders_current_owner_id_fkey(id,code,full_name,email)'
const SELECT_WITH_CUSTOMER = `*,${CUSTOMER_JOIN},${ITEMS_JOIN},${OWNER_JOIN}`

// ============================================================================
// HỌ HĐ (MUA TIẾP) + CÁC BÊN CỦA ĐƠN — sales_family_parties_p1.sql (+ p1b), 17/11/2026
// Mỗi đợt mua tiếp là MỘT đơn bình thường (tiền / lô / công nợ / giao hàng KHÔNG đổi công thức nào),
// chỉ thêm móc parent_order_id về đơn GỐC giữ HĐ đã ký + ô Người nhận hàng.
// ⚠ Code phải chạy được CẢ TRƯỚC LẪN SAU migration: mọi cột/embed mới đi qua familyPartiesReady().
// ============================================================================

/**
 * Embed ĐƠN GỐC. ⚠ Ghi theo TÊN CỘT `parent:parent_order_id(...)` — đừng viết `sales_orders!parent_order_id`:
 * khoá ngoại tự tham chiếu nên PostgREST hiểu ngược thành "các đơn con" và trả MẢNG (gợi ý theo tên constraint
 * thì PGRST200). Danh sách đợt con của một gốc: getFamily (truy vấn riêng).
 */
const PARENT_JOIN = 'parent:parent_order_id(id,code,contract_no,contract_date,customer_id,currency,status)'
/** Cột người nhận gắn vào `ship_to` (ship_to_customer_id KHÔNG có FK → không embed được, xem đầu file migration). */
const SHIP_TO_COLUMNS = 'id,code,name,short_name,country,address,status'
/** 8 cột mới trên sales_orders — chưa migration thì KHÔNG gửi (safe-key như cargo_kind của lệnh điều động). */
const FAMILY_PARTY_COLUMNS = [
  'parent_order_id', 'continuation_seq', 'docs_cite_root',
  'ship_to_customer_id', 'consignee_name', 'consignee_address', 'notify_party', 'notify_address',
] as const
const PRINT_TEXT_COLUMNS = ['consignee_name', 'consignee_address', 'notify_party', 'notify_address'] as const
/** Khoá embed (không phải cột) — lỡ trải cả object đơn vào update thì bỏ đi, kẻo PGRST204. */
const EMBED_KEYS = ['parent', 'ship_to', 'customer', 'items', 'current_owner'] as const
/** Index chuẩn hoá số HĐ (chặn trùng với đơn chưa huỷ). */
const CONTRACT_NO_UNIQUE_INDEX = 'ux_sales_orders_contract_no_norm_active'
const NOT_READY_MSG = 'Chưa bật tính năng Đơn mua tiếp / Người nhận hàng (thiếu migration sales_family_parties_p1) — báo IT'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)
function assertUuid(s: unknown, label = 'Mã đơn'): asserts s is string {
  if (!isUuid(s)) throw new Error(`${label} không hợp lệ`)
}
/** Chuỗi gõ tay đưa vào .or()/ilike: bỏ ký tự phá cú pháp PostgREST (phẩy, ngoặc) và ký tự đại diện LIKE. */
const searchSafe = (s?: string | null): string => (s || '').replace(/[,()*%\\:"]/g, ' ').replace(/\s+/g, ' ').trim()
const likeSafe = (s: string): string => s.replace(/[\\%_*]/g, '_')

type PgErrorLike = { code?: string; message?: string; details?: string | null; hint?: string | null }

let familyReadyProbe: Promise<boolean> | null = null

/**
 * Migration sales_family_parties_p1 đã áp chưa? Thăm dò MỘT lần mỗi phiên (cache promise):
 * select parent_order_id, ship_to_customer_id limit 1. Thiếu cột/quan hệ (42703 / PGRST204 / PGRST200 /
 * "does not exist") → false; lỗi khác (mạng…) → NÉM và lần gọi sau thăm dò lại.
 */
function familyPartiesReady(): Promise<boolean> {
  if (!familyReadyProbe) {
    const probe = (async () => {
      const { error } = await supabase.from('sales_orders').select('parent_order_id,ship_to_customer_id').limit(1)
      if (!error) return true
      const e = error as PgErrorLike
      const m = `${e.message || ''} ${e.details || ''}`.toLowerCase()
      if (['42703', 'PGRST204', 'PGRST200'].includes(e.code || '') || m.includes('does not exist') || m.includes('could not find')) {
        return false
      }
      throw error
    })()
    familyReadyProbe = probe
    probe.catch(() => { if (familyReadyProbe === probe) familyReadyProbe = null })
  }
  return familyReadyProbe
}

/**
 * Chuỗi select đơn đầy đủ: thêm embed đơn gốc khi đã migration. Kiểu khai báo = chuỗi cũ để supabase-js không
 * suy ra GenericStringError cho chuỗi động (client không có kiểu DB nên dòng vẫn là any như trước).
 */
const orderSelect = (ready: boolean): typeof SELECT_WITH_CUSTOMER =>
  (ready ? `${SELECT_WITH_CUSTOMER},${PARENT_JOIN}` : SELECT_WITH_CUSTOMER) as typeof SELECT_WITH_CUSTOMER

/** PostgREST trả embed many-to-one là object; phòng bản cũ trả mảng. */
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

/**
 * Gắn `ship_to` (hồ sơ người nhận) vào từng đơn bằng MỘT truy vấn theo id — thay cho embed (ship_to_customer_id
 * cố ý không có FK, kẻo mọi embed `sales_customers(...)` không ghi khoá thành PGRST201). Trả mảng MỚI, không sửa
 * object truyền vào. Đơn không có người nhận → ship_to = null.
 */
async function attachShipTo<T extends { ship_to_customer_id?: string | null }>(
  rows: T[],
): Promise<Array<T & { ship_to: SalesOrderShipTo | null }>> {
  const ids = [...new Set(rows.map((r) => r?.ship_to_customer_id).filter(isUuid))]
  const map = new Map<string, SalesOrderShipTo>()
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabase.from('sales_customers').select(SHIP_TO_COLUMNS).in('id', ids.slice(i, i + 150))
    if (error) throw new Error(`Không tải được người nhận hàng: ${error.message}`)
    for (const c of (data || []) as unknown as SalesOrderShipTo[]) map.set(c.id, c)
  }
  return rows.map((r) => ({ ...r, ship_to: r?.ship_to_customer_id ? map.get(r.ship_to_customer_id) ?? null : null }))
}

/** Bản sửa đơn an toàn: bỏ khoá embed; không đổi họ HĐ qua sửa thường; chưa migration thì bỏ 8 cột mới. */
function sanitizeOrderPatch(src: Record<string, unknown>, ready: boolean): Record<string, unknown> {
  const p: Record<string, unknown> = { ...src }
  for (const k of EMBED_KEYS) delete p[k]
  for (const k of ['parent_order_id', 'continuation_seq'] as const) {
    if (k in p) {
      // Nối/tách họ HĐ chỉ qua createContinuation (insert) hoặc SQL có kiểm — số đợt do trigger cấp.
      console.warn(`[salesOrderService] Bỏ qua '${k}' khi sửa đơn — họ HĐ không đổi qua cập nhật thường`)
      delete p[k]
    }
  }
  if (!ready) {
    for (const k of FAMILY_PARTY_COLUMNS) delete p[k]
    return p
  }
  if (p.ship_to_customer_id === '') p.ship_to_customer_id = null
  for (const k of PRINT_TEXT_COLUMNS) {
    if (typeof p[k] === 'string') p[k] = (p[k] as string).trim() || null
  }
  return p
}

/** Đơn CHƯA HUỶ đang giữ số HĐ (so sau chuẩn hoá, như index DB) — chỉ để câu báo trùng nói rõ đơn nào. */
async function findActiveContractHolder(
  contractNo: string,
  excludeId?: string,
): Promise<{ id: string; code: string; contract_no: string | null } | null> {
  const norm = normalizeContractNo(contractNo)
  const token = norm.split(' ')[0]
  if (!token) return null
  const { data, error } = await supabase
    .from('sales_orders')
    .select('id, code, contract_no')
    .neq('status', 'cancelled')
    .ilike('contract_no', `%${likeSafe(token)}%`)
    .limit(50)
  if (error) throw error
  return ((data || []) as Array<{ id: string; code: string; contract_no: string | null }>)
    .find((r) => r.id !== excludeId && normalizeContractNo(r.contract_no) === norm) ?? null
}

/**
 * Lỗi ghi sales_orders → Error tiếng Việt. Trùng index ux_sales_orders_contract_no_norm_active (23505) →
 * 'Số HĐ "X" đã có ở đơn …'; các lỗi khác giữ câu cũ `${prefix}: ${message}` (dichLoiHeThong dịch tiếp ở UI).
 */
async function orderWriteError(
  prefix: string,
  error: PgErrorLike,
  contractNo?: string | null,
  excludeId?: string,
): Promise<Error> {
  const raw = `${error.message || ''} ${error.details || ''}`
  if ((error.code === '23505' || /duplicate key/i.test(raw)) && raw.includes(CONTRACT_NO_UNIQUE_INDEX)) {
    const no = (contractNo || '').trim() || /\)=\((.+)\) already exists/i.exec(error.details || '')?.[1] || ''
    let where = 'ở đơn khác'
    if (no) {
      try {
        const holder = await findActiveContractHolder(no, excludeId)
        if (holder) where = `ở đơn ${soDisplayCode(holder)}${holder.contract_no ? ` (${holder.code})` : ''}`
      } catch (e) {
        // Chỉ để câu báo nói rõ đơn nào — lỗi chính (trùng số) vẫn báo ngay dưới đây.
        console.warn('[salesOrderService] Không tra được đơn đang giữ số HĐ:', e)
      }
    }
    return new Error(no
      ? `Số HĐ "${no}" đã có ${where} — đổi số khác rồi lưu lại`
      : `Số HĐ này đã có ${where} — đổi số khác rồi lưu lại`)
  }
  return new Error(`${prefix}: ${error.message || 'lỗi không rõ'}`)
}

/** Số đơn GỢI Ý cho đợt mua tiếp (owner chốt 17/11/2026): '<số HĐ gốc>-D<n>', vd HA20260302-D3. */
export function continuationNo(rootContractNo: string, seq: number): string {
  return `${(rootContractNo || '').trim()}-D${seq}`
}

/** Một đơn trong họ HĐ (gốc + các đợt mua tiếp) — dữ liệu cho chip/khối "Các đợt cùng HĐ". */
export interface SalesFamilyMember {
  id: string
  code: string
  contract_no: string | null
  contract_date: string | null
  status: SalesOrderStatus
  current_stage: string | null
  customer_id: string
  currency: string | null
  grade: string | null
  quantity_tons: number | null
  unit_price: number | null
  total_value_usd: number | null
  total_value_vnd: number | null
  actual_payment_amount: number | null
  payment_status: string | null
  etd: string | null
  order_date: string | null
  created_at: string
  parent_order_id: string | null
  continuation_seq: number | null
  docs_cite_root: boolean | null
  ship_to_customer_id: string | null
  ship_to: SalesOrderShipTo | null
  /** true = đơn GỐC (giữ HĐ đã ký) */
  is_root: boolean
  /** Số đợt hiển thị: gốc = 1, đợt con = continuation_seq (có lỗ khi một đợt bị huỷ/xoá — cố ý không đánh lại). */
  seq: number
}

const FAMILY_MEMBER_COLUMNS =
  'id, code, contract_no, contract_date, status, current_stage, customer_id, currency, grade, quantity_tons, ' +
  'unit_price, total_value_usd, total_value_vnd, actual_payment_amount, payment_status, etd, order_date, created_at, ' +
  'parent_order_id, continuation_seq, docs_cite_root, ship_to_customer_id'

/** Tổng của các đơn CHƯA HUỶ trong họ. */
export interface FamilyTotals {
  orders: number
  tons: number
  /** Σ total_value_usd (đơn VND = số USD quy đổi) */
  valueUsd: number
  /** Σ actual_payment_amount (USD) */
  paidUsd: number
}

/**
 * CỘNG các đơn chưa huỷ của một họ HĐ (Kanban "Soi HĐ", khối "Các đợt cùng HĐ", đầu form mua tiếp).
 * ⚠ Chỉ là phép cộng để xem: mỗi đợt là MỘT khoản phải thu riêng — đây KHÔNG phải mẫu số công nợ.
 */
export function familyTotals(
  members: Array<{ status?: string | null; quantity_tons?: number | null; total_value_usd?: number | null; actual_payment_amount?: number | null }>,
): FamilyTotals {
  const live = members.filter((m) => m.status !== 'cancelled')
  const sum = (f: (m: (typeof live)[number]) => number | null | undefined) =>
    live.reduce((s, m) => s + (Number(f(m)) || 0), 0)
  return {
    orders: live.length,
    tons: Math.round(sum((m) => m.quantity_tons) * 1000) / 1000,
    valueUsd: Math.round(sum((m) => m.total_value_usd) * 100) / 100,
    paidUsd: Math.round(sum((m) => m.actual_payment_amount) * 100) / 100,
  }
}

/** Một dòng sản phẩm ĐIỀN SẴN cho đợt mua tiếp: chép quy cách, KHÔNG chép tấn/giá (Sale nhập). */
export interface ContinuationItemPrefill {
  grade: string
  /** luôn 0 — Sale nhập tấn của đợt này */
  quantity_tons: number
  /** luôn 0 — Sale nhập giá; giá đợt nguồn ở last_unit_price chỉ để làm placeholder ('đợt trước $2.470/t') */
  unit_price: number
  last_unit_price: number | null
  payment_terms?: string
  bale_weight_kg?: number
  bale_weights_kg?: number[]
  bales_per_container?: number
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
}

/** Bộ ĐIỀN SẴN của form Mua tiếp (create_flow) — khoá người mua / đồng tiền / ngày HĐ gốc. */
export type ContinuationPrefill = Omit<CreateSalesOrderData, 'items' | 'quantity_tons' | 'unit_price'> & {
  customer_id: string
  currency: string
  parent_order_id: string
  items: ContinuationItemPrefill[]
}

const SPEC_KEYS = [
  'drc_min', 'drc_max', 'moisture_max', 'dirt_max', 'ash_max',
  'nitrogen_max', 'volatile_max', 'pri_min', 'mooney_max', 'color_lovibond_max',
] as const

const orUndef = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined || (v as unknown) === '' ? undefined : v)

/**
 * ĐIỀN SẴN đợt mua tiếp từ ĐƠN NGUỒN (đơn được bấm — gốc hoặc đợt gần nhất để lấy quy cách mới nhất) — hàm THUẦN.
 * KHOÁ theo GỐC: người mua, đồng tiền (đổi tiền = HĐ mới), ngày HĐ = ngày HĐ gốc.
 * CHÉP từ nguồn: grade + chỉ tiêu KT · kg/bành, bành/cont, đóng gói · incoterm, POL, POD · điều khoản + ghi chú
 * thanh toán · tỉ lệ hoa hồng (tiền tính lại theo tấn đợt) · shipping marks · NH thụ hưởng · người nhận + 4 ô chữ in.
 * KHÔNG chép: tấn, đơn giá, ETD/ETA, ngày giao, thời gian giao, PO khách, cọc, L/C, booking, tàu, ghi chú, tỷ giá,
 * ngày PI, dòng mô tả Invoice riêng (invoice_extra_lines).
 */
export function continuationPrefill(source: SalesOrder, root: Pick<SalesOrder, 'id' | 'customer_id' | 'currency' | 'contract_date'>): ContinuationPrefill {
  const specs: Partial<Record<(typeof SPEC_KEYS)[number], number>> = {}
  for (const k of SPEC_KEYS) {
    const v = orUndef(source[k])
    if (v !== undefined) specs[k] = Number(v)
  }

  const srcItems = [...(source.items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const itemFrom = (it: Partial<SalesOrderItem>): ContinuationItemPrefill => {
    const bw = Number(it.bale_weight_kg ?? source.bale_weight_kg) || 35
    const out: ContinuationItemPrefill = {
      grade: it.grade || source.grade || '',
      quantity_tons: 0,
      unit_price: 0,
      last_unit_price: Number(it.unit_price ?? source.unit_price) || null,
      payment_terms: orUndef(it.payment_terms ?? source.payment_terms),
      bale_weight_kg: bw,
      bale_weights_kg: it.bale_weights_kg && it.bale_weights_kg.length ? it.bale_weights_kg.map(Number) : [bw],
      bales_per_container: orUndef(it.bales_per_container ?? source.bales_per_container)
        ?? defaultBalesPerContainer(bw, source.container_type ?? null),
      packing_type: orUndef(it.packing_type ?? source.packing_type),
      packing_note: orUndef(it.packing_note ?? source.packing_note),
    }
    for (const k of SPEC_KEYS) {
      const v = orUndef(it[k]) ?? specs[k]
      if (v !== undefined) out[k] = Number(v)
    }
    return out
  }
  const items = srcItems.length ? srcItems.map(itemFrom) : [itemFrom({})]

  return {
    // KHOÁ theo gốc
    customer_id: root.customer_id,
    currency: (root.currency || 'USD').toUpperCase(),
    contract_date: orUndef(root.contract_date),
    parent_order_id: root.id,
    docs_cite_root: true,
    // Quy cách hàng (header lấy theo dòng đầu như form tạo đơn)
    grade: items.length === 1 ? items[0].grade : items.map((i) => i.grade).join(' + '),
    ...specs,
    packing_type: orUndef(source.packing_type),
    bale_weight_kg: items[0].bale_weight_kg,
    bales_per_container: items[0].bales_per_container,
    pallets_per_container: orUndef(source.pallets_per_container),
    bales_per_pallet: orUndef(source.bales_per_pallet),
    shrink_wrap: source.shrink_wrap ?? undefined,
    pallet_required: source.pallet_required ?? undefined,
    packing_note: orUndef(source.packing_note),
    container_type: orUndef(source.container_type),
    marking_instructions: orUndef(source.marking_instructions),
    shipping_marks: orUndef(source.shipping_marks),
    item_no: orUndef(source.item_no),
    packing_desc: orUndef(source.packing_desc),
    // Giao hàng
    incoterm: orUndef(source.incoterm),
    port_of_loading: orUndef(source.port_of_loading),
    port_of_destination: orUndef(source.port_of_destination),
    port_of_discharge: orUndef(source.port_of_discharge),
    // Thanh toán + hoa hồng (tiền hoa hồng tính lại theo tấn của đợt)
    payment_terms: orUndef(source.payment_terms),
    payment_terms_note: orUndef(source.payment_terms_note),
    commission_pct: orUndef(source.commission_pct),
    commission_usd_per_mt: orUndef(source.commission_usd_per_mt),
    // NH thụ hưởng của đơn nguồn
    bank_name: orUndef(source.bank_name),
    bank_account: orUndef(source.bank_account),
    bank_swift: orUndef(source.bank_swift),
    bank_full_name: orUndef(source.bank_full_name),
    bank_address: orUndef(source.bank_address),
    // Các bên — chép từ nguồn, form tô nổi "Người nhận lần này — xác nhận"
    ship_to_customer_id: source.ship_to_customer_id ?? null,
    consignee_name: source.consignee_name ?? null,
    consignee_address: source.consignee_address ?? null,
    notify_party: source.notify_party ?? null,
    notify_address: source.notify_address ?? null,
    items,
  }
}

/** Đầu vào createContinuation: người mua / đồng tiền / ngày HĐ / đơn gốc bị KHOÁ theo gốc nên không có ở đây. */
export type CreateContinuationInput = Partial<Omit<CreateSalesOrderData, 'customer_id' | 'currency' | 'contract_date' | 'parent_order_id'>> & {
  /** Số đơn của đợt — form điền sẵn suggestContinuationNo, Sale xác nhận/sửa. BẮT BUỘC. */
  contract_no: string
}

/** Ngữ cảnh mở form Mua tiếp (đầu form + điền sẵn + kiểm khi lưu). */
export interface ContinuationContext {
  /** Đơn được bấm (gốc hoặc một đợt) — nguồn quy cách */
  source: SalesOrder
  /** Đơn GỐC thật giữ HĐ đã ký */
  root: SalesOrder
  /** Cả họ hiện có (gốc + đợt, kể cả đợt đã huỷ), sắp theo số đợt */
  family: SalesFamilyMember[]
  /** Cộng các đơn chưa huỷ của họ ('họ đang có 2 đợt, 403,2 t') */
  totals: FamilyTotals
  /** Số đợt DỰ KIẾN (trigger cấp số thật khi lưu) */
  nextSeq: number
  /** Số đơn gợi ý '<số HĐ gốc>-D<n>' ('' khi gốc chưa có số HĐ) */
  suggestedNo: string
  /** Số file HĐ đã đính ở GỐC — 0 → cảnh báo 'HĐ gốc chưa có file HĐ đã ký — chọn đúng HĐ?'; null = không đọc được */
  rootContractFileCount: number | null
  prefill: ContinuationPrefill
  /** Đơn giá của đơn nguồn — CHỈ làm placeholder, không điền vào ô giá */
  lastUnitPrice: number | null
  /** Có lý do thì KHÔNG tạo được (gốc huỷ / gốc chưa có số HĐ / nguồn đã huỷ / chưa migration) */
  blockReason: string | null
}

/** Dòng nhẹ cho Kanban — đúng các cột SalesKanbanPage dùng + cột họ HĐ / người nhận. */
export interface SalesKanbanRow {
  id: string
  code: string
  contract_no: string | null
  customer_id: string | null
  grade: string
  quantity_tons: number | null
  status: string
  total_value_usd: number | null
  currency: string | null
  total_value_vnd: number | null
  payment_status: string | null
  actual_payment_amount: number | null
  delivery_date: string | null
  etd: string | null
  current_stage: string | null
  current_owner_id: string | null
  stage_started_at: string | null
  stage_sla_hours: number | null
  customer: { id: string; short_name: string | null; name: string } | null
  owner: { id: string; full_name: string } | null
  /** null với HĐ mới hoặc khi chưa migration */
  parent_order_id: string | null
  continuation_seq: number | null
  ship_to_customer_id: string | null
  parent: SalesOrderParentRef | null
  ship_to: SalesOrderShipTo | null
}

/** Patch "Các bên của đơn" (thẻ OrderPartiesCard). Chuỗi rỗng → NULL (= tự suy). */
export interface OrderPartiesPatch {
  /** Người nhận hàng — = người mua / rỗng → NULL */
  ship_to_customer_id?: string | null
  consignee_name?: string | null
  consignee_address?: string | null
  notify_party?: string | null
  notify_address?: string | null
}

/** Đầu vào cảnh báo "có thể trùng lô hàng" lúc lưu đơn. */
export interface DuplicateCheckInput {
  customer_id: string
  ship_to_customer_id?: string | null
  grade: string
  quantity_tons: number
  unit_price: number
  /** so giá chỉ trong CÙNG đồng tiền (mặc định USD) */
  currency?: string | null
  /** 'YYYY-MM-DD' — mặc định hôm nay (giờ VN) */
  order_date?: string | null
  /** bỏ chính đơn đang sửa */
  exclude_id?: string | null
  /** id gốc của họ đang tạo đợt — để gắn cờ same_family */
  family_root_id?: string | null
}

/** Một đơn có thể trùng lô hàng với đơn đang lưu. */
export interface PossibleDuplicate {
  id: string
  code: string
  contract_no: string | null
  status: SalesOrderStatus
  grade: string | null
  quantity_tons: number | null
  unit_price: number | null
  currency: string | null
  order_date: string | null
  created_at: string
  customer_id: string
  customer: { id: string; code: string | null; name: string; short_name: string | null; country: string | null } | null
  ship_to_customer_id: string | null
  ship_to: SalesOrderShipTo | null
  /** cùng người mua */
  same_buyer: boolean
  /** khác người mua nhưng chéo vai (người mua bên này là người nhận bên kia, hoặc cùng người nhận) — ca sinh đôi 136/301 */
  crossed: boolean
  /** cùng họ HĐ với đơn đang tạo (cùng gốc) */
  same_family: boolean
}

/** Một HĐ gốc cho modal chọn "Mua tiếp theo HĐ đã ký…". */
export interface RootContractOption {
  id: string
  code: string
  contract_no: string
  contract_date: string | null
  order_date: string | null
  status: SalesOrderStatus
  customer_id: string
  customer: { id: string; code: string | null; name: string; short_name: string | null; country: string | null } | null
  currency: string | null
  grade: string | null
  quantity_tons: number | null
  /** số file HĐ (doc_type 'contract' có file) đính ở gốc — 0 = chưa có file HĐ đã ký */
  contract_file_count: number
  /** số đơn CẢ HỌ chưa huỷ (gốc = đợt 1) */
  family_size: number
  /** đơn mới nhất chưa huỷ của họ — làm ĐƠN NGUỒN để lấy quy cách mới nhất */
  latest_member_id: string
  /** khớp tìm kiếm qua một ĐỢT (vd gõ 'HA20260301' ra gốc HA20260302) → số của đợt đó */
  matched_via: string | null
}

const ROOT_OPTION_COLUMNS =
  'id, code, contract_no, contract_date, order_date, created_at, status, customer_id, currency, grade, quantity_tons, parent_order_id, ' +
  'customer:sales_customers!customer_id(id, code, name, short_name, country)'

// ============================================================================
// VALID STATUS TRANSITIONS
// ============================================================================

const VALID_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['producing', 'cancelled'],
  producing: ['ready', 'cancelled'],
  ready: ['packing', 'cancelled'],
  packing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['invoiced'],
  invoiced: ['paid'],
  paid: [],
  cancelled: [],
}

/**
 * Các trạng thái được phép chuyển TỚI từ `from` — CÙNG bảng luật updateStatus dùng để chặn.
 * UI (đổi trạng thái inline ở Sổ đơn) lọc lựa chọn theo đây, đừng tự chép bảng khác.
 */
export function nextOrderStatuses(from: SalesOrderStatus): SalesOrderStatus[] {
  return VALID_TRANSITIONS[from] ?? []
}

const statusVi = (s: string): string => ORDER_STATUS_LABELS[s as SalesOrderStatus] ?? s

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Bộ lọc DÙNG CHUNG cho getList() và getAllForSummary().
 * BẮT BUỘC dùng chung: nếu 2 nơi lọc khác nhau thì DÒNG TỔNG sẽ không khớp
 * danh sách đang hiển thị — và đó là con số khách dùng để lên kế hoạch.
 */
function applyListFilters<T>(query: T, params: SalesOrderListParams, familyReady = false): T {
  const { search, status, customer_id, grade, date_from, date_to } = params
  let q: any = query
  if (status && status !== 'all') q = q.eq('status', status)
  if (customer_id) {
    // Vai của khách trong lọc (chưa migration → luôn 'buyer' như cũ, dòng tổng không đổi)
    const role = familyReady ? (params.customer_role || 'buyer') : 'buyer'
    if (role === 'receiver') q = q.eq('ship_to_customer_id', customer_id)
    else if (role === 'both' && isUuid(customer_id)) q = q.or(`customer_id.eq.${customer_id},ship_to_customer_id.eq.${customer_id}`)
    else q = q.eq('customer_id', customer_id)
  }
  if (familyReady) {
    if (params.order_kind === 'new') q = q.is('parent_order_id', null)
    else if (params.order_kind === 'continuation') q = q.not('parent_order_id', 'is', null)
    if (params.family_root) {
      // id lạ (vd bộ lọc lưu sẵn hỏng) → .eq báo lỗi uuid rõ ràng thay vì ghép chuỗi vào .or()
      q = isUuid(params.family_root)
        ? q.or(`id.eq.${params.family_root},parent_order_id.eq.${params.family_root}`)
        : q.eq('id', params.family_root)
    }
  }
  if (grade) q = q.eq('grade', grade)
  if (date_from) q = q.gte('order_date', date_from)
  if (date_to) q = q.lte('order_date', date_to)
  if (params.etd_from) q = q.gte('etd', params.etd_from)
  if (params.etd_to) q = q.lte('etd', params.etd_to)
  if (params.overdue_etd_only) {
    const today = new Date().toLocaleDateString('sv-SE')
    q = q.lt('etd', today).not('status', 'in', '(delivered,invoiced,paid,cancelled)')
  }
  if (search) {
    q = q.or(
      `contract_no.ilike.%${search}%,code.ilike.%${search}%,customer_po.ilike.%${search}%,grade.ilike.%${search}%,booking_reference.ilike.%${search}%,bl_number.ilike.%${search}%,bank_name.ilike.%${search}%,vessel_name.ilike.%${search}%`,
    )
  }
  return q as T
}

/** Dòng nhẹ cho DÒNG TỔNG (chỉ 4 cột) — không kéo cả đơn về. */
export interface SalesOrderSummaryRow {
  id: string
  quantity_tons: number | null
  total_value_usd: number | null
  status: string
  grade: string | null
}

export const salesOrderService = {
  /**
   * TOÀN BỘ đơn khớp bộ lọc (KHÔNG phân trang) — cho DÒNG TỔNG.
   * Khách hỏi "lọc RSS → còn thiếu bao nhiêu tấn" ⇒ tổng của 10 dòng/trang là VÔ NGHĨA.
   * ⚠ Loop theo trang 1000: PostgREST có db.max_rows (thường 1000) và CẮT ÂM THẦM,
   *   không báo lỗi → tổng sẽ thiếu mà không ai biết. Trả kèm `total` để UI cảnh báo.
   */
  async getAllForSummary(
    params: SalesOrderListParams,
  ): Promise<{ rows: SalesOrderSummaryRow[]; total: number; truncated: boolean }> {
    const PAGE = 1000
    const CAP = 5000
    const rows: SalesOrderSummaryRow[] = []
    let total = 0
    const ready = await familyPartiesReady()   // cùng bộ lọc với getList → dòng tổng khớp danh sách
    for (let from = 0; from < CAP; from += PAGE) {
      let q = supabase
        .from('sales_orders')
        .select('id, quantity_tons, total_value_usd, status, grade', { count: 'exact' })
      q = applyListFilters(q, params, ready)
      const { data, error, count } = await q.range(from, from + PAGE - 1)
      if (error) throw error
      total = count ?? total
      const batch = (data || []) as SalesOrderSummaryRow[]
      rows.push(...batch)
      if (batch.length < PAGE || rows.length >= total) break
    }
    return { rows, total, truncated: rows.length < total }
  },

  // ==========================================================================
  // GENERATE CODE — SO-YYYY-XXXX
  // ==========================================================================

  /**
   * Sinh mã đơn hàng tự động: SO-2026-0001, SO-2026-0002, ...
   */
  async generateCode(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `SO-${year}-`

    // Lấy tất cả mã SO-YYYY-XXXX, lọc đúng format số
    const { data } = await supabase
      .from('sales_orders')
      .select('code')
      .like('code', `${prefix}%`)

    let maxNum = 0
    if (data && data.length > 0) {
      for (const row of data) {
        const suffix = row.code.replace(prefix, '')
        const num = parseInt(suffix, 10)
        if (!isNaN(num) && num > maxNum) {
          maxNum = num
        }
      }
    }

    return `${prefix}${String(maxNum + 1).padStart(4, '0')}`
  },

  // ==========================================================================
  // LIST & QUERY
  // ==========================================================================

  /**
   * Lấy danh sách đơn hàng với phân trang, tìm kiếm, lọc
   */
  async getList(
    params: SalesOrderListParams = {},
  ): Promise<{ data: SalesOrder[]; total: number }> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      customer_id,
      grade,
      date_from,
      date_to,
      sort_by = 'order_date',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const ready = await familyPartiesReady()
    let query = supabase
      .from('sales_orders')
      .select(orderSelect(ready), { count: 'exact' })

    query = applyListFilters(query, params, ready)

    // Sắp xếp — explicit NULLS LAST khi ASC để đơn chưa có giá trị
    // (vd ETD null) xuống cuối list. Secondary sort by id để stable order
    // khi nhiều row cùng primary value (avoid Postgres arbitrary plan).
    const isAsc = sort_order === 'asc'
    // Chặn ở ĐÂY vì đây là nút cổ chai duy nhất che được mọi đường vào (URL, bộ lọc lưu sẵn).
    const safeSortBy = SORTABLE_ORDER_COLUMNS.has(sort_by) ? sort_by : 'order_date'
    query = query.order(safeSortBy, { ascending: isAsc, nullsFirst: false })
    // Sắp theo số HĐ: gốc rồi -D2, -D3 đứng liền nhau (contract_no_sort_key đã bỏ đuôi -D, p1b) — gốc NULL lên trước.
    if (ready && (safeSortBy === 'contract_no_sort_key' || safeSortBy === 'contract_no')) {
      query = query.order('continuation_seq', { ascending: true, nullsFirst: true })
    }
    if (safeSortBy !== 'code' && safeSortBy !== 'id') {
      query = query.order('id', { ascending: false })  // stable tie-breaker
    }

    // Phân trang
    const { data, error, count } = await query.range(from, to)

    if (error) {
      throw new Error(`Không thể tải danh sách đơn hàng: ${error.message}`)
    }

    return {
      data: (ready ? await attachShipTo((data || []) as SalesOrder[]) : (data || [])) as SalesOrder[],
      total: count || 0,
    }
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  /**
   * Lấy thông tin đơn hàng theo ID, kèm thông tin khách hàng
   */
  async getById(id: string): Promise<SalesOrder | null> {
    const ready = await familyPartiesReady()
    const { data, error } = await supabase
      .from('sales_orders')
      .select(orderSelect(ready))
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(`Không thể tải thông tin đơn hàng: ${error.message}`)
    }
    if (!data) return null

    // Đã migration: kèm `parent` (embed) + `ship_to` (truy vấn thứ hai theo id)
    return (ready ? (await attachShipTo([data as SalesOrder]))[0] : data) as SalesOrder
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Tạo đơn hàng mới — tự tính toán các trường phụ thuộc
   *
   * Auto-calculate:
   * - quantity_kg = quantity_tons × 1000
   * - total_bales = balesFromTons(quantity_tons, bale_weight_kg)  (baleMath.ts — 33,33 kg = 30 bành/tấn)
   * - container_count = ceil(total_bales / bành_mỗi_cont)  (20ft: 630 bành 33,33 kg | 600 bành 35 kg; 40ft gấp đôi)
   * - total_value_usd = quantity_tons × unit_price
   * - total_value_vnd = total_value_usd × exchange_rate
   * - Chỉ tiêu kỹ thuật tự điền từ rubber_grade_standards nếu chưa nhập
   */
  async create(input: CreateSalesOrderData): Promise<SalesOrder> {
    // Validation
    if (!input.customer_id) {
      throw new Error('Vui lòng chọn khách hàng')
    }
    if (!input.grade) {
      throw new Error('Vui lòng chọn cấp mủ')
    }
    if (!input.quantity_tons || input.quantity_tons <= 0) {
      throw new Error('Số lượng (tấn) phải lớn hơn 0')
    }
    if (!input.unit_price || input.unit_price <= 0) {
      throw new Error('Đơn giá phải lớn hơn 0')
    }

    // Họ HĐ + Các bên: chỉ gửi khi đã migration (safe-key). Đơn mua tiếp mà chưa migration → chặn, đừng
    // lặng lẽ tạo thành HĐ mới.
    const ready = await familyPartiesReady()
    if (!ready && input.parent_order_id) {
      throw new Error(NOT_READY_MSG)
    }
    const extraCols: Record<string, unknown> = {}
    const putIf = (k: string, v: unknown) => {
      if (v === undefined || v === null) return
      if (typeof v === 'string') {
        const t = v.trim()
        if (t) extraCols[k] = t
        return
      }
      extraCols[k] = v
    }
    // Cột sẵn có — chỉ gửi khi có giá trị (đơn mua tiếp chép từ đơn nguồn)
    putIf('port_of_discharge', input.port_of_discharge)
    putIf('pallets_per_container', input.pallets_per_container)
    putIf('bales_per_pallet', input.bales_per_pallet)
    putIf('shipping_marks', input.shipping_marks)
    putIf('item_no', input.item_no)
    putIf('packing_desc', input.packing_desc)
    putIf('proforma_date', input.proforma_date)
    putIf('bank_full_name', input.bank_full_name)
    putIf('bank_address', input.bank_address)
    if (ready) {
      putIf('parent_order_id', input.parent_order_id)
      // Người nhận = người mua → NULL (một cách ghi duy nhất cho đơn mua thẳng; trigger DB cũng đổi)
      if (input.ship_to_customer_id && input.ship_to_customer_id !== input.customer_id) {
        extraCols.ship_to_customer_id = input.ship_to_customer_id
      }
      for (const k of PRINT_TEXT_COLUMNS) putIf(k, input[k])
      if (typeof input.docs_cite_root === 'boolean') extraCols.docs_cite_root = input.docs_cite_root
      // continuation_seq: KHÔNG gửi — trigger trg_so_family_guard cấp dưới khoá
    }

    // Sinh mã tự động
    const code = await salesOrderService.generateCode()

    // Tính toán các trường tự động
    const baleWeight = input.bale_weight_kg || 33.33
    const quantityKg = input.quantity_tons * 1000
    const totalBales = balesFromTons(input.quantity_tons, baleWeight)
    const containerType = input.container_type || '20ft'
    // Container 20ft: 600 bành (35kg) hoặc 630 bành (33.33kg) | 40ft: gấp đôi
    const balesPerContainer = input.bales_per_container || defaultBalesPerContainer(baleWeight, containerType)
    const containerCount = containersFromBales(totalBales, balesPerContainer)
    // Đồng tiền của đơn: USD (xuất khẩu) hoặc VND (nội địa) — xem salesMoney.ts.
    // Đơn VND phải có tỷ giá để có số USD quy đổi cho công nợ/báo cáo.
    const currency = (input.currency || 'USD').toUpperCase()
    const exchangeRate = input.exchange_rate || 0
    const rateErr = isVnd(currency) ? vndRateError(exchangeRate) : null
    if (rateErr) {
      throw new Error(rateErr)
    }
    const { total_value_usd: totalValueUsd, total_value_vnd: totalValueVnd } =
      orderTotals(currency, input.quantity_tons, input.unit_price, exchangeRate)

    // Lấy chỉ tiêu kỹ thuật từ bảng tiêu chuẩn nếu chưa nhập thủ công
    let qualitySpecs: Record<string, number | undefined> = {}
    const hasCustomSpecs =
      input.drc_min !== undefined ||
      input.drc_max !== undefined ||
      input.moisture_max !== undefined ||
      input.dirt_max !== undefined
    if (!hasCustomSpecs && input.grade) {
      const gradeSpecs = await salesOrderService.getGradeSpecs(input.grade)
      if (gradeSpecs) {
        qualitySpecs = gradeSpecs
      }
    }

    const { data, error } = await supabase
      .from('sales_orders')
      .insert({
        code,
        customer_id: input.customer_id,
        customer_po: input.customer_po || null,
        grade: input.grade,
        quantity_tons: input.quantity_tons,
        quantity_kg: quantityKg,
        unit_price: input.unit_price,
        currency,
        exchange_rate: exchangeRate || null,
        total_value_usd: totalValueUsd,
        total_value_vnd: totalValueVnd,
        incoterm: input.incoterm || 'FOB',
        port_of_loading: input.port_of_loading || null,
        port_of_destination: input.port_of_destination || null,

        // Chỉ tiêu kỹ thuật — ưu tiên input, fallback grade specs
        drc_min: input.drc_min ?? qualitySpecs.drc_min ?? null,
        drc_max: input.drc_max ?? qualitySpecs.drc_max ?? null,
        moisture_max: input.moisture_max ?? qualitySpecs.moisture_max ?? null,
        dirt_max: input.dirt_max ?? qualitySpecs.dirt_max ?? null,
        ash_max: input.ash_max ?? qualitySpecs.ash_max ?? null,
        nitrogen_max: input.nitrogen_max ?? qualitySpecs.nitrogen_max ?? null,
        volatile_max: input.volatile_max ?? qualitySpecs.volatile_max ?? null,
        pri_min: input.pri_min ?? qualitySpecs.pri_min ?? null,
        mooney_max: input.mooney_max ?? qualitySpecs.mooney_max ?? null,
        color_lovibond_max: input.color_lovibond_max ?? qualitySpecs.color_lovibond_max ?? null,

        // Đóng gói
        packing_type: input.packing_type || 'loose_bale',
        bale_weight_kg: baleWeight,
        total_bales: totalBales,
        shrink_wrap: input.shrink_wrap ?? false,
        pallet_required: input.pallet_required ?? false,
        marking_instructions: input.marking_instructions || null,
        packing_note: input.packing_note || null,

        // Vận chuyển
        container_type: containerType,
        container_count: containerCount,
        shipping_line: input.shipping_line || null,
        vessel_name: input.vessel_name || null,
        booking_reference: input.booking_reference || null,

        // Ngày tháng
        order_date: input.order_date || new Date().toLocaleDateString('sv-SE'),
        delivery_date: input.delivery_date || null,
        etd: input.etd || null,
        eta: input.eta || null,

        // Thanh toán
        payment_terms: input.payment_terms || null,
        payment_terms_note: input.payment_terms_note || null,
        lc_number: input.lc_number || null,
        lc_bank: input.lc_bank || null,
        lc_expiry_date: input.lc_expiry_date || null,
        shipment_time: input.shipment_time || null,

        // Trạng thái mặc định
        status: 'draft' as SalesOrderStatus,

        // Chứng từ
        coa_generated: false,
        packing_list_generated: false,
        invoice_generated: false,
        bl_received: false,

        // Hợp đồng (v4)
        contract_no: input.contract_no || null,
        contract_date: input.contract_date || null,
        commission_pct: input.commission_pct || null,
        commission_usd_per_mt: input.commission_usd_per_mt || null,
        commission_amount: input.commission_amount || null,
        bank_account: input.bank_account || null,
        bank_swift: input.bank_swift || null,
        bank_name: input.bank_name || null,
        bales_per_container: input.bales_per_container || null,

        // Ghi chú
        notes: input.notes || null,
        internal_notes: input.internal_notes || null,

        // Cột chỉ gửi khi có giá trị (safe-key) — gồm 7 cột họ HĐ/các bên khi đã migration
        ...extraCols,
      })
      .select(orderSelect(ready))
      .single()

    if (error) {
      throw await orderWriteError('Không thể tạo đơn hàng', error, input.contract_no)
    }

    // ★ Insert items nếu có (multi-product)
    if (input.items && input.items.length > 0) {
      const itemRows = input.items.map((item, idx) => {
        const qtyKg = item.quantity_tons * 1000
        const bw = item.bale_weight_kg || 33.33
        const baleWeights = item.bale_weights_kg && item.bale_weights_kg.length > 0
          ? item.bale_weights_kg
          : [bw]
        const totalBales = balesFromTons(item.quantity_tons, bw)
        const bpc = item.bales_per_container || 576
        return {
          sales_order_id: data.id,
          grade: item.grade,
          quantity_tons: item.quantity_tons,
          unit_price: item.unit_price,
          currency,
          payment_terms: item.payment_terms || null,
          // Cột tên _usd: với đơn VND đây là số USD quy đổi (÷ tỷ giá) để cộng chung báo cáo
          total_value_usd: toUsdEquivalent(item.quantity_tons * item.unit_price, currency, exchangeRate),
          quantity_kg: qtyKg,
          bale_weight_kg: bw,
          bale_weights_kg: baleWeights,
          total_bales: totalBales,
          bales_per_container: bpc,
          container_count: containersFromBales(totalBales, bpc),
          packing_type: item.packing_type || 'loose_bale',
          packing_note: item.packing_note || null,
          drc_min: item.drc_min ?? null,
          drc_max: item.drc_max ?? null,
          moisture_max: item.moisture_max ?? null,
          dirt_max: item.dirt_max ?? null,
          ash_max: item.ash_max ?? null,
          nitrogen_max: item.nitrogen_max ?? null,
          volatile_max: item.volatile_max ?? null,
          pri_min: item.pri_min ?? null,
          mooney_max: item.mooney_max ?? null,
          color_lovibond_max: item.color_lovibond_max ?? null,
          sort_order: idx,
        }
      })
      await supabase.from('sales_order_items').insert(itemRows)

      // Update tổng trên order header
      const totalTons = itemRows.reduce((s, i) => s + i.quantity_tons, 0)
      const totalUsd = itemRows.reduce((s, i) => s + (i.total_value_usd || 0), 0)
      const totalBalesAll = itemRows.reduce((s, i) => s + (i.total_bales || 0), 0)
      const totalContainers = itemRows.reduce((s, i) => s + (i.container_count || 0), 0)
      await supabase.from('sales_orders').update({
        quantity_tons: totalTons,
        quantity_kg: totalTons * 1000,
        total_value_usd: totalUsd,
        total_bales: totalBalesAll,
        container_count: totalContainers,
        // Giữ grade = grade đầu tiên (hoặc multi)
        grade: itemRows.length === 1 ? itemRows[0].grade : itemRows.map(i => i.grade).join(' + '),
        unit_price: itemRows.length === 1 ? itemRows[0].unit_price : Math.round((totalUsd / totalTons) * 100) / 100,
      }).eq('id', data.id)
    }

    return (ready ? (await attachShipTo([data as SalesOrder]))[0] : data) as SalesOrder
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Cập nhật đơn hàng — chỉ cho phép khi ở trạng thái draft hoặc confirmed
   */
  async update(id: string, input: Partial<CreateSalesOrderData>): Promise<SalesOrder> {
    // Kiểm tra trạng thái hiện tại
    const existing = await salesOrderService.getById(id)
    if (!existing) {
      throw new Error('Đơn hàng không tồn tại')
    }

    if (!['draft', 'confirmed'].includes(existing.status)) {
      throw new Error(
        `Không thể chỉnh sửa đơn hàng ở trạng thái "${statusVi(existing.status)}". Chỉ được sửa khi ở trạng thái Nháp hoặc Đã xác nhận.`,
      )
    }

    // Tính lại các trường phụ thuộc nếu có thay đổi liên quan
    const quantityTons = input.quantity_tons ?? existing.quantity_tons
    const unitPrice = input.unit_price ?? existing.unit_price
    const baleWeight = input.bale_weight_kg ?? existing.bale_weight_kg
    const containerType = input.container_type ?? existing.container_type ?? '20ft'
    const exchangeRate = input.exchange_rate ?? existing.exchange_rate ?? 0
    const currency = (input.currency ?? existing.currency ?? 'USD').toUpperCase()

    const recalculated: Record<string, unknown> = {}

    if (
      input.quantity_tons !== undefined ||
      input.bale_weight_kg !== undefined ||
      input.bales_per_container !== undefined ||
      input.container_type !== undefined ||
      input.unit_price !== undefined ||
      input.exchange_rate !== undefined ||
      input.currency !== undefined
    ) {
      const quantityKg = quantityTons * 1000
      const totalBales = balesFromTons(quantityTons, baleWeight)
      // Cùng luật với lúc tạo: bành ÷ bành/cont. Bản cũ chia tấn cho 20 → 210 t ra 11 cont
      // dù 630 bành × 33,33 kg = 21 t/cont, tức 10 cont.
      const balesPerContainer = (input.bales_per_container ?? existing.bales_per_container) || defaultBalesPerContainer(baleWeight, containerType)
      const containerCount = containersFromBales(totalBales, balesPerContainer)
      const rateErr = isVnd(currency) ? vndRateError(exchangeRate) : null
      if (rateErr) throw new Error(rateErr)
      const totals = orderTotals(currency, quantityTons, unitPrice, exchangeRate)

      recalculated.quantity_kg = quantityKg
      recalculated.total_bales = totalBales
      recalculated.container_count = containerCount
      recalculated.total_value_usd = totals.total_value_usd
      recalculated.total_value_vnd = totals.total_value_vnd
    }

    // Bỏ khoá embed/items, không đổi họ HĐ qua đây, chưa migration thì không gửi cột mới
    const ready = await familyPartiesReady()
    const patch = sanitizeOrderPatch(input as Record<string, unknown>, ready)

    const { data, error } = await supabase
      .from('sales_orders')
      .update({
        ...patch,
        ...recalculated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(orderSelect(ready))
      .single()

    if (error) {
      throw await orderWriteError('Không thể cập nhật đơn hàng', error, input.contract_no ?? existing.contract_no, id)
    }

    return (ready ? (await attachShipTo([data as SalesOrder]))[0] : data) as SalesOrder
  },

  // ==========================================================================
  // STATUS TRANSITIONS
  // ==========================================================================

  /**
   * Chuyển trạng thái đơn hàng — kiểm tra luồng hợp lệ
   *
   * draft → confirmed → producing → ready → packing → shipped → delivered → invoiced → paid
   * Hủy: bất kỳ (trừ paid/shipped/delivered) → cancelled
   */
  async updateStatus(
    id: string,
    newStatus: SalesOrderStatus,
    data?: { confirmed_by?: string; shipped_at?: string; reason?: string; actor?: { id?: string | null; name?: string | null } },
  ): Promise<void> {
    const existing = await salesOrderService.getById(id)
    if (!existing) {
      throw new Error('Đơn hàng không tồn tại')
    }

    const currentStatus = existing.status
    const allowed = VALID_TRANSITIONS[currentStatus]

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Không thể chuyển trạng thái từ "${statusVi(currentStatus)}" sang "${statusVi(newStatus)}". Vui lòng kiểm tra lại quy trình.`,
      )
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    // Thêm thông tin bổ sung khi chuyển trạng thái
    if (newStatus === 'confirmed') {
      updateData.confirmed_at = new Date().toISOString()
      if (data?.confirmed_by) {
        updateData.confirmed_by = data.confirmed_by
      }
    }

    if (newStatus === 'shipped') {
      updateData.shipped_at = data?.shipped_at || new Date().toISOString()
    }

    // Ai đổi trạng thái → trigger trg_log_sales_status ghi vào sales_order_status_log
    if (data?.actor) {
      updateData.last_status_changed_by_id = data.actor.id ?? null
      updateData.last_status_changed_by_name = data.actor.name ?? null
    }
    if (data?.reason) updateData.last_status_change_reason = data.reason

    const { error } = await supabase
      .from('sales_orders')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể chuyển trạng thái đơn hàng: ${error.message}`)
    }

    // Khi đơn xuất hàng → chốt tất cả MTS allocations sang status='shipped'
    // để kho biết hàng đã ra khỏi và ngăn release ngược.
    if (newStatus === 'shipped') {
      try {
        const { stockAllocationService } = await import('./stockAllocationService')
        await stockAllocationService.markAllShippedForOrder(id)
      } catch (e) {
        console.error('[updateStatus] Failed to mark allocations shipped:', e)
        // Non-blocking: sales status đã update rồi, chỉ log
      }
    }
  },

  // ==========================================================================
  // CANCEL ORDER
  // ==========================================================================

  /**
   * Hủy đơn hàng — yêu cầu lý do hủy
   */
  async cancelOrder(id: string, reason: string, actor?: { id?: string | null; name?: string | null }): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Vui lòng nhập lý do hủy đơn hàng')
    }

    const existing = await salesOrderService.getById(id)
    if (!existing) {
      throw new Error('Đơn hàng không tồn tại')
    }

    const nonCancellable: SalesOrderStatus[] = ['paid', 'shipped', 'delivered']
    if (nonCancellable.includes(existing.status)) {
      throw new Error(
        `Không thể hủy đơn hàng ở trạng thái "${statusVi(existing.status)}". Đơn hàng đã xuất/giao/thanh toán không được phép hủy.`,
      )
    }

    if (existing.status === 'cancelled') {
      throw new Error('Đơn hàng đã được hủy trước đó')
    }

    // HĐ gốc còn đợt mua tiếp chưa huỷ → báo rõ TRƯỚC khi ghi (trigger trg_so_family_guard là chốt cuối)
    if (!existing.parent_order_id && (await familyPartiesReady())) {
      const { count: nLive, error: famErr } = await supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .eq('parent_order_id', id)
        .neq('status', 'cancelled')
      if (famErr) throw new Error(`Không kiểm được các đợt mua tiếp của HĐ: ${famErr.message}`)
      if (nLive) {
        throw new Error(`HĐ gốc ${soDisplayCode(existing)} còn ${nLive} đơn mua tiếp chưa huỷ — huỷ các đợt đó trước`)
      }
    }

    const { error } = await supabase
      .from('sales_orders')
      .update({
        status: 'cancelled' as SalesOrderStatus,
        internal_notes: existing.internal_notes
          ? `${existing.internal_notes}\n[HỦY] ${reason}`
          : `[HỦY] ${reason}`,
        last_status_changed_by_id: actor?.id ?? null,
        last_status_changed_by_name: actor?.name ?? null,
        last_status_change_reason: `Hủy đơn: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể hủy đơn hàng: ${error.message}`)
    }

    // ★ Release tất cả stock allocations về kho (MTS flow)
    try {
      const { stockAllocationService } = await import('./stockAllocationService')
      const releasedCount = await stockAllocationService.releaseAllByOrder(id, `Hủy đơn: ${reason}`)
      if (releasedCount > 0) {
        console.log(`[cancelOrder] Released ${releasedCount} stock allocations for cancelled order ${existing.code}`)
      }
    } catch (e) {
      console.error('[cancelOrder] Failed to release allocations:', e)
      // Không throw — đơn đã cancelled, allocations không release được cần xử lý riêng
    }
  },

  /** Lịch sử đổi TRẠNG THÁI đơn (ai · khi nào · từ→tới) — cho tab Lịch sử (admin). */
  async getStatusLog(orderId: string): Promise<SalesOrderStatusLog[]> {
    const { data, error } = await supabase
      .from('sales_order_status_log')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as SalesOrderStatusLog[]) || []
  },

  // ==========================================================================
  // DELETE — Admin only
  // ==========================================================================

  async deleteOrder(id: string): Promise<void> {
    // HĐ gốc còn đợt mua tiếp → CHẶN TRƯỚC khi xoá bất kỳ bảng con nào. Không kiểm trước thì FK RESTRICT
    // (parent_order_id) chỉ chặn ở câu cuối, để lại đơn gốc đã mất dòng hàng / container / hồ sơ file.
    if (await familyPartiesReady()) {
      const { data: kids, error: famErr } = await supabase
        .from('sales_orders')
        .select('id, status')
        .eq('parent_order_id', id)
      if (famErr) throw new Error(`Không kiểm được các đợt mua tiếp của HĐ: ${famErr.message}`)
      if (kids && kids.length > 0) {
        const nCancelled = kids.filter((k: { status: string }) => k.status === 'cancelled').length
        throw new Error(
          `HĐ gốc đang có ${kids.length} đơn mua tiếp${nCancelled ? ` (${nCancelled} đã huỷ)` : ''} — xoá các đợt đó trước rồi mới xoá được HĐ gốc`,
        )
      }
    }
    // Xóa theo thứ tự FK: invoices → items → containers → documents → order
    await supabase.from('sales_invoices').delete().eq('sales_order_id', id)
    await supabase.from('sales_order_items').delete().eq('sales_order_id', id)
    await supabase.from('sales_order_containers').delete().eq('sales_order_id', id)
    await supabase.from('sales_order_documents').delete().eq('sales_order_id', id)
    const { error } = await supabase.from('sales_orders').delete().eq('id', id)
    if (error) throw new Error(`Không thể xóa: ${error.message}`)
  },

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Lấy thống kê tổng quan đơn hàng — KHÔNG tính đơn hủy.
   * "Tổng đơn" = số đơn active + đã giao + đã thanh toán, đơn cancelled
   * không tính (đã hủy = không tồn tại nghiệp vụ).
   */
  async getStats(): Promise<SalesOrderStats> {
    // Tổng số đơn hàng (loại đơn hủy)
    const { count: total } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelled')

    // Đếm theo từng trạng thái song song
    const statusCounts = async (s: SalesOrderStatus) => {
      const { count } = await supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
      return count || 0
    }

    const [draft, confirmed, producing, ready, packing, shipped, delivered, invoiced, paid] = await Promise.all([
      statusCounts('draft'),
      statusCounts('confirmed'),
      statusCounts('producing'),
      statusCounts('ready'),
      statusCounts('packing'),
      statusCounts('shipped'),
      statusCounts('delivered'),
      statusCounts('invoiced'),
      statusCounts('paid'),
    ])

    // Đơn quá ETD: ETD < today, chưa delivered/paid/cancelled
    const today = new Date().toLocaleDateString('sv-SE')
    const { count: overdueEtd } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .lt('etd', today)
      .not('status', 'in', '(delivered,invoiced,paid,cancelled)')

    // Thống kê tháng này
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0]

    // Đơn hàng trong tháng (không tính đơn đã hủy)
    const { data: monthOrders, count: ordersThisMonth } = await supabase
      .from('sales_orders')
      .select('total_value_usd', { count: 'exact' })
      .gte('order_date', firstDayOfMonth)
      .lte('order_date', lastDayOfMonth)
      .neq('status', 'cancelled')

    // Tổng giá trị USD trong tháng
    const totalValueUsdMonth = (monthOrders || []).reduce(
      (sum: number, o: { total_value_usd: number | null }) =>
        sum + (o.total_value_usd || 0),
      0,
    )

    return {
      total: total || 0,
      draft,
      confirmed,
      producing,
      ready,
      packing,
      shipped,
      delivered,
      invoiced,
      paid,
      overdue_etd: overdueEtd || 0,
      total_value_usd_month: totalValueUsdMonth,
      orders_this_month: ordersThisMonth || 0,
    }
  },

  // ==========================================================================
  // GET BY CUSTOMER
  // ==========================================================================

  /**
   * Đơn CHƯA HUỶ mà khách ĐỨNG TÊN MUA (customer_id), mới nhất trước — form tạo đơn điền sẵn theo [0]
   * ("đơn gần nhất"), nên bỏ đơn huỷ (trước 17/11/2026 có thể điền theo đơn đã huỷ). Đã migration thì kèm
   * `ship_to` để gợi ý 'Đơn trước của A giao cho B — dùng lại?'.
   */
  async getByCustomer(customerId: string): Promise<SalesOrder[]> {
    const ready = await familyPartiesReady()
    const { data, error } = await supabase
      .from('sales_orders')
      .select(orderSelect(ready))
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Không thể tải đơn hàng của khách hàng: ${error.message}`)
    }

    return (ready ? await attachShipTo((data || []) as SalesOrder[]) : (data || [])) as SalesOrder[]
  },

  // ==========================================================================
  // GRADE SPECS — Lấy chỉ tiêu kỹ thuật theo cấp mủ
  // ==========================================================================

  /**
   * Lấy chỉ tiêu kỹ thuật tiêu chuẩn từ bảng rubber_grade_standards.
   * Dùng để tự điền khi chọn cấp mủ cho đơn hàng.
   */
  async getGradeSpecs(grade: string): Promise<{
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
  } | null> {
    const { data, error } = await supabase
      .from('rubber_grade_standards')
      .select(
        'drc_min,drc_max,moisture_max,dirt_max,ash_max,nitrogen_max,volatile_max,pri_min,mooney_max,color_lovibond_max',
      )
      .eq('grade', grade)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    return data as {
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
    }
  },

  // ==========================================================================
  // CONTAINERS
  // ==========================================================================

  /**
   * Lấy danh sách Sales Order đang sẵn sàng để xuất hàng (cân OUT) — app cân (apps/weighbridge) dùng.
   * Filter: status IN ('confirmed', 'producing', 'ready', 'packing', 'shipped')
   * — sẵn sàng cân; bỏ draft/cancelled/delivered/invoiced/paid.
   * `code` = SỐ ĐƠN hiển thị (soDisplayCode: số HĐ, rơi về mã SO) để nhãn app cân XUẤT theo số đơn
   * (17/11/2026); mã SO nội bộ ở `so_code`. Embed ghi khoá `!customer_id` + kiểm lỗi (trước nuốt lỗi → app
   * cân mất danh sách SO im lặng).
   */
  async getActiveForShipping(): Promise<Array<{
    id: string
    code: string
    customer_name: string
    customer_id: string
    grade: string
    quantity_kg: number
    container_count: number
    container_type: string
    port_of_destination: string | null
    vessel_name: string | null
    status: string
    /** mã SO nội bộ (SO-2026-…) */
    so_code: string
    /** số HĐ / số đơn (null nếu đơn chưa có số) */
    contract_no: string | null
  }>> {
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`
        id, code, contract_no, customer_id, grade, quantity_kg,
        container_count, container_type,
        port_of_destination, vessel_name, status,
        customer:sales_customers!customer_id(id, name, short_name)
      `)
      .in('status', ['confirmed', 'producing', 'ready', 'packing', 'shipped'])
      .order('order_date', { ascending: false })
      .limit(50)

    if (error) {
      throw new Error(`Không tải được danh sách đơn hàng bán đang xuất: ${error.message}`)
    }

    return (data || []).map((d: any) => ({
      id: d.id,
      code: soDisplayCode(d),
      so_code: d.code,
      contract_no: d.contract_no ?? null,
      customer_id: d.customer_id,
      customer_name: partyShortName(one(d.customer)),
      grade: d.grade || '',
      quantity_kg: Number(d.quantity_kg) || 0,
      container_count: d.container_count || 0,
      container_type: d.container_type || '20ft',
      port_of_destination: d.port_of_destination,
      vessel_name: d.vessel_name,
      status: d.status,
    }))
  },

  /**
   * Lấy danh sách container của đơn hàng
   */
  async getContainers(orderId: string): Promise<SalesOrderContainer[]> {
    const { data, error } = await supabase
      .from('sales_order_containers')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('created_at')

    if (error) {
      throw new Error(`Không thể tải danh sách container: ${error.message}`)
    }

    return (data || []) as SalesOrderContainer[]
  },

  /**
   * Thêm container vào đơn hàng
   */
  async addContainer(
    orderId: string,
    containerData: Partial<SalesOrderContainer>,
  ): Promise<SalesOrderContainer> {
    const { data, error } = await supabase
      .from('sales_order_containers')
      .insert({
        sales_order_id: orderId,
        container_no: containerData.container_no || null,
        seal_no: containerData.seal_no || null,
        container_type: containerData.container_type || '20ft',
        gross_weight_kg: containerData.gross_weight_kg || null,
        tare_weight_kg: containerData.tare_weight_kg || null,
        net_weight_kg: containerData.net_weight_kg || null,
        bale_count: containerData.bale_count || null,
        status: 'planning',
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Không thể thêm container: ${error.message}`)
    }

    return data as SalesOrderContainer
  },

  // ==========================================================================
  // LOCK / UNLOCK — v4
  // ==========================================================================

  async lockOrder(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('sales_orders')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw new Error(`Không thể khóa đơn hàng: ${error.message}`)
  },

  async unlockOrder(id: string): Promise<void> {
    const { error } = await supabase
      .from('sales_orders')
      .update({
        is_locked: false,
        locked_at: null,
        locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw new Error(`Không thể mở khóa đơn hàng: ${error.message}`)
  },

  // ==========================================================================
  // UPDATE FIELDS — v4: cập nhật field bất kỳ (bypass status check cho BP khác)
  // ==========================================================================

  async updateFields(id: string, fields: Partial<SalesOrder>): Promise<SalesOrder> {
    // Bỏ khoá embed (parent/ship_to/customer/items); không đổi họ HĐ; chưa migration thì không gửi 8 cột mới
    const ready = await familyPartiesReady()
    const patch = sanitizeOrderPatch(fields as Record<string, unknown>, ready)
    const { data, error } = await supabase
      .from('sales_orders')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(orderSelect(ready))
      .single()

    if (error) throw await orderWriteError('Không thể cập nhật', error, fields.contract_no, id)
    return (ready ? (await attachShipTo([data as SalesOrder]))[0] : data) as SalesOrder
  },

  // ==========================================================================
  // HỌ HĐ (MUA TIẾP) + CÁC BÊN CỦA ĐƠN — sales_family_parties_p1.sql (17/11/2026)
  // ==========================================================================

  /**
   * Migration sales_family_parties_p1 đã áp chưa (thăm dò 1 lần/phiên). false → UI ẨN nút/khối mới,
   * service không gửi cột mới. Lỗi mạng → ném (lần sau hỏi lại).
   */
  familyPartiesReady,

  /**
   * Gắn `ship_to` {id,code,name,short_name,country,address,status} vào từng đơn bằng MỘT truy vấn theo id
   * (ship_to_customer_id không có FK nên không embed). Trả mảng mới; đơn không có người nhận → ship_to = null.
   */
  attachShipTo,

  /**
   * Dữ liệu Kanban (dời từ SalesKanbanPage): mọi đơn CHƯA HUỶ, mới tạo trước — đúng các cột cũ + customer_id,
   * và khi đã migration: parent_order_id, continuation_seq, ship_to_customer_id, `parent` (đơn gốc), `ship_to`.
   * Lỗi → ném NGUYÊN lỗi PostgREST (trang còn đọc code PGRST301/303 để báo lỗi phiên).
   */
  async listForKanban(): Promise<SalesKanbanRow[]> {
    const ready = await familyPartiesReady()
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`
        id, code, contract_no, customer_id, grade, quantity_tons, status, total_value_usd,
        currency, total_value_vnd,
        payment_status, actual_payment_amount,
        delivery_date, etd, current_stage, current_owner_id,
        stage_started_at, stage_sla_hours,
        customer:sales_customers!sales_orders_customer_id_fkey(id, short_name, name),
        owner:employees!sales_orders_current_owner_id_fkey(id, full_name)${ready ? `,
        parent_order_id, continuation_seq, ship_to_customer_id, ${PARENT_JOIN}` : ''}
      `)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
    if (error) throw error

    const rows = ((data || []) as any[]).map((o) => ({
      ...o,
      customer: one(o.customer),
      owner: one(o.owner),
      parent_order_id: o.parent_order_id ?? null,
      continuation_seq: o.continuation_seq ?? null,
      ship_to_customer_id: o.ship_to_customer_id ?? null,
      parent: one(o.parent),
    }))
    return (await attachShipTo(rows)) as SalesKanbanRow[]
  },

  /**
   * CẢ HỌ HĐ của một đơn gốc: gốc + mọi đợt mua tiếp (KỂ CẢ đợt đã huỷ, cờ ở `status`), sắp theo số đợt
   * (gốc = 1), kèm `ship_to`. Lỡ truyền id một ĐỢT thì tự quy về gốc. Chưa migration → [].
   * Cộng các đơn: familyTotals(members) — không phải mẫu số công nợ.
   */
  async getFamily(rootId: string): Promise<SalesFamilyMember[]> {
    if (!(await familyPartiesReady())) return []
    assertUuid(rootId)
    const load = async (rid: string) => {
      const { data, error } = await supabase
        .from('sales_orders')
        .select(FAMILY_MEMBER_COLUMNS)
        .or(`id.eq.${rid},parent_order_id.eq.${rid}`)
      if (error) throw new Error(`Không tải được các đợt cùng HĐ: ${error.message}`)
      return (data || []) as unknown as Array<Omit<SalesFamilyMember, 'ship_to' | 'is_root' | 'seq'>>
    }
    let realRoot = rootId
    let rows = await load(rootId)
    const self = rows.find((r) => r.id === rootId)
    if (self?.parent_order_id) {
      realRoot = self.parent_order_id
      rows = await load(realRoot)
    }
    const withShip = await attachShipTo(rows)
    return withShip
      .map((r) => ({ ...r, is_root: r.id === realRoot, seq: r.id === realRoot ? 1 : (r.continuation_seq ?? 0) }))
      .sort((a, b) => a.seq - b.seq || String(a.created_at).localeCompare(String(b.created_at)))
  },

  /**
   * SỐ ĐƠN CẢ HỌ cho nhiều đơn gốc trong MỘT truy vấn (parent_order_id IN …): mỗi id → 1 + số đợt CHƯA HUỶ
   * (gốc tính là đợt 1). Mọi id hợp lệ (uuid) truyền vào đều có trong kết quả; ≥ 2 mới hiện chip '⧉ HĐ gốc · n đợt'.
   * Truyền id của một ĐỢT thì ra 1 (đợt không có đợt con). Chưa migration → mọi id = 1.
   */
  async getFamilyCounts(rootIds: string[]): Promise<Record<string, number>> {
    const ids = [...new Set((rootIds || []).filter(isUuid))]
    const out: Record<string, number> = {}
    for (const id of ids) out[id] = 1
    if (ids.length === 0 || !(await familyPartiesReady())) return out
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('parent_order_id')
        .in('parent_order_id', ids.slice(i, i + 150))
        .neq('status', 'cancelled')
      if (error) throw new Error(`Không đếm được các đợt mua tiếp: ${error.message}`)
      for (const r of (data || []) as Array<{ parent_order_id: string }>) {
        out[r.parent_order_id] = (out[r.parent_order_id] ?? 1) + 1
      }
    }
    return out
  },

  /**
   * Số đơn GỢI Ý cho đợt mua tiếp kế tiếp: '<số HĐ gốc>-D<n>', n = số đợt lớn nhất của họ (TÍNH CẢ đợt đã huỷ,
   * đúng như trigger cấp) + 1. Hệ thống chỉ GỢI Ý — Sale xác nhận/sửa; DB không tự cấp số. Bị index chặn trùng
   * (hai người tạo cùng lúc) thì gọi lại để lấy số kế tiếp. Truyền id một đợt cũng được (tự quy về gốc).
   */
  async suggestContinuationNo(rootId: string): Promise<string> {
    if (!(await familyPartiesReady())) throw new Error(NOT_READY_MSG)
    const family = await salesOrderService.getFamily(rootId)
    const root = family.find((m) => m.is_root)
    if (!root) throw new Error('Không tìm thấy HĐ gốc — có thể đã bị xoá')
    const rootNo = (root.contract_no || '').trim()
    if (!rootNo) throw new Error(`Đơn gốc ${root.code} chưa có số HĐ — điền số HĐ cho đơn gốc trước`)
    const maxSeq = family.reduce((m, f) => Math.max(m, f.continuation_seq ?? 1), 1)
    return continuationNo(rootNo, maxSeq + 1)
  },

  /**
   * Ngữ cảnh mở form "Tạo đơn mua tiếp" từ ĐƠN NGUỒN (gốc hoặc một đợt): gốc thật, cả họ + tổng, số đợt dự kiến,
   * số gợi ý, số file HĐ ở gốc, bộ điền sẵn (continuationPrefill) và `blockReason` nếu không tạo được.
   */
  async getContinuationContext(sourceId: string): Promise<ContinuationContext> {
    const ready = await familyPartiesReady()
    const source = await salesOrderService.getById(sourceId)
    if (!source) throw new Error('Không tìm thấy đơn nguồn — có thể đã bị xoá')
    const root = source.parent_order_id ? await salesOrderService.getById(source.parent_order_id) : source
    if (!root) throw new Error('Không tìm thấy HĐ gốc của đơn này — có thể đã bị xoá')
    const family = ready ? await salesOrderService.getFamily(root.id) : []
    const maxSeq = family.reduce((m, f) => Math.max(m, f.continuation_seq ?? 1), 1)
    const rootNo = (root.contract_no || '').trim()

    let rootContractFileCount: number | null = null
    const { count, error: docErr } = await supabase
      .from('sales_order_documents')
      .select('id', { count: 'exact', head: true })
      .eq('sales_order_id', root.id)
      .eq('doc_type', 'contract')
      .not('file_url', 'is', null)
    if (docErr) console.warn('[salesOrderService] Không đếm được file HĐ của đơn gốc:', docErr)
    else rootContractFileCount = count ?? 0

    const blockReason = !ready
      ? NOT_READY_MSG
      : root.status === 'cancelled'
        ? `HĐ gốc ${soDisplayCode(root)} đã huỷ — không tạo đơn mua tiếp được`
        : !rootNo
          ? `Đơn gốc ${root.code} chưa có số HĐ — điền số HĐ cho đơn gốc trước`
          : source.status === 'cancelled'
            ? `Đơn ${soDisplayCode(source)} đã huỷ — mở HĐ gốc ${soDisplayCode(root)} để tạo đơn mua tiếp`
            : null

    return {
      source,
      root,
      family,
      totals: familyTotals(family),
      nextSeq: maxSeq + 1,
      suggestedNo: rootNo ? continuationNo(rootNo, maxSeq + 1) : '',
      rootContractFileCount,
      prefill: continuationPrefill(source, root),
      lastUnitPrice: source.unit_price ?? null,
      blockReason,
    }
  },

  /**
   * TẠO ĐƠN MUA TIẾP = create() + parent_order_id (gốc THẬT) + ngày HĐ gốc. Trường Sale không gửi thì lấy theo
   * continuationPrefill(đơn nguồn); người mua / đồng tiền / ngày HĐ LUÔN theo gốc (trigger cũng chặn khác người mua
   * hoặc khác đồng tiền). `contract_no` bắt buộc (số gợi ý đã được Sale xác nhận). Không tự tính số đợt — trigger cấp
   * dưới khoá; hàm đọc lại đơn sau khi lưu (có continuation_seq, parent, ship_to).
   * Đơn VND vẫn phải gửi exchange_rate (không chép tỷ giá).
   */
  async createContinuation(sourceId: string, input: CreateContinuationInput): Promise<SalesOrder> {
    if (!(await familyPartiesReady())) throw new Error(NOT_READY_MSG)
    const source = await salesOrderService.getById(sourceId)
    if (!source) throw new Error('Không tìm thấy đơn nguồn — có thể đã bị xoá')
    if (source.status === 'cancelled') {
      throw new Error(`Đơn ${soDisplayCode(source)} đã huỷ — mở HĐ gốc để tạo đơn mua tiếp`)
    }
    const root = source.parent_order_id ? await salesOrderService.getById(source.parent_order_id) : source
    if (!root) throw new Error('Không tìm thấy HĐ gốc của đơn này — có thể đã bị xoá')
    if (root.status === 'cancelled') {
      throw new Error(`HĐ gốc ${soDisplayCode(root)} đã huỷ — không tạo đơn mua tiếp được`)
    }
    if (!(root.contract_no || '').trim()) {
      throw new Error(`Đơn gốc ${root.code} chưa có số HĐ — điền số HĐ cho đơn gốc trước`)
    }
    const contractNo = (input.contract_no || '').trim()
    if (!contractNo) {
      throw new Error('Chưa có Số đơn cho đợt mua tiếp — bấm dùng số gợi ý hoặc gõ số')
    }

    const { items: prefillItems, ...prefillHeader } = continuationPrefill(source, root)
    // Trường Sale gửi (khác undefined) thắng phần điền sẵn
    const given = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as Partial<CreateSalesOrderData>
    const merged: CreateSalesOrderData = {
      ...(prefillHeader as CreateSalesOrderData),
      ...given,
      // KHOÁ theo gốc
      customer_id: root.customer_id,
      currency: (root.currency || 'USD').toUpperCase(),
      contract_date: root.contract_date || undefined,
      parent_order_id: root.id,
      contract_no: contractNo,
    } as CreateSalesOrderData

    // Dòng hàng: Sale gửi items thì dùng; không thì đơn 1 mặt hàng lấy tấn/giá ở header
    let items = input.items && input.items.length ? input.items : undefined
    if (!items) {
      if (prefillItems.length > 1) {
        throw new Error('Đơn nguồn có nhiều mặt hàng — nhập tấn và đơn giá cho từng dòng')
      }
      const tons = Number(input.quantity_tons) || 0
      const price = Number(input.unit_price) || 0
      items = [{ ...prefillItems[0], grade: input.grade || prefillItems[0].grade, quantity_tons: tons, unit_price: price }]
    }
    const tons = items.reduce((s, i) => s + (Number(i.quantity_tons) || 0), 0)
    const amount = items.reduce((s, i) => s + (Number(i.quantity_tons) || 0) * (Number(i.unit_price) || 0), 0)
    merged.items = items.map((i) => ({ ...i, currency: merged.currency }))
    merged.quantity_tons = tons
    merged.unit_price = items.length === 1 ? Number(items[0].unit_price) || 0 : (tons > 0 ? Math.round((amount / tons) * 100) / 100 : 0)
    merged.grade = items.length === 1 ? items[0].grade : items.map((i) => i.grade).join(' + ')
    if (input.bale_weight_kg === undefined) merged.bale_weight_kg = items[0].bale_weight_kg
    if (input.bales_per_container === undefined) merged.bales_per_container = items[0].bales_per_container
    if (input.packing_type === undefined && items[0].packing_type) merged.packing_type = items[0].packing_type as PackingType

    // Người nhận = người mua → NULL
    if (merged.ship_to_customer_id === merged.customer_id) merged.ship_to_customer_id = null
    // Hoa hồng: chép tỉ lệ, TÍNH LẠI tiền theo tấn của đợt (USD/MT ưu tiên; % theo trị giá USD quy đổi)
    if (input.commission_amount === undefined) {
      const usdValue = orderTotals(merged.currency, tons, tons > 0 ? amount / tons : 0, merged.exchange_rate).total_value_usd || 0
      merged.commission_amount = merged.commission_usd_per_mt
        ? Math.round(tons * merged.commission_usd_per_mt * 100) / 100
        : merged.commission_pct
          ? Math.round(usdValue * merged.commission_pct) / 100
          : undefined
    }

    const created = await salesOrderService.create(merged)
    // Đọc lại: continuation_seq do trigger cấp, tổng header do create() tính lại sau khi chèn dòng hàng
    return (await salesOrderService.getById(created.id)) ?? created
  },

  /**
   * Lưu "Các bên của đơn" (thẻ OrderPartiesCard): người nhận + 4 ô chữ in Consignee/Notify. Người nhận = người mua
   * → NULL; chuỗi rỗng → NULL (= tự suy). Ghi qua updateFields (audit_log tự ghi). Chưa migration → ném.
   */
  async updateParties(id: string, patch: OrderPartiesPatch): Promise<SalesOrder> {
    if (!(await familyPartiesReady())) throw new Error(NOT_READY_MSG)
    const clean: Record<string, unknown> = {}
    if (patch.ship_to_customer_id !== undefined) {
      const v = patch.ship_to_customer_id || null
      if (v !== null) assertUuid(v, 'Người nhận hàng')
      clean.ship_to_customer_id = v
    }
    for (const k of PRINT_TEXT_COLUMNS) {
      const v = patch[k]
      if (v !== undefined) clean[k] = typeof v === 'string' ? (v.trim() || null) : null
    }
    if (Object.keys(clean).length === 0) {
      const cur = await salesOrderService.getById(id)
      if (!cur) throw new Error('Đơn hàng không tồn tại')
      return cur
    }
    if (clean.ship_to_customer_id) {
      const { data: cur, error } = await supabase.from('sales_orders').select('customer_id').eq('id', id).maybeSingle()
      if (error) throw new Error(`Không đọc được người mua của đơn: ${error.message}`)
      if (!cur) throw new Error('Đơn hàng không tồn tại')
      if ((cur as { customer_id: string }).customer_id === clean.ship_to_customer_id) clean.ship_to_customer_id = null
    }
    return salesOrderService.updateFields(id, clean as Partial<SalesOrder>)
  },

  /**
   * Cảnh báo "CÓ THỂ TRÙNG LÔ HÀNG" lúc lưu: đơn CHƯA HUỶ khác cùng grade, cùng tấn, đơn giá lệch ≤ 0,5% (cùng
   * đồng tiền), ngày đặt trong ±7 ngày, và hai đơn có chung một bên (cùng người mua, hoặc chéo vai mua/nhận, hoặc
   * cùng người nhận) — bắt đúng ca sinh đôi HA20260136/HA20260301. Chỉ để HỎI LẠI, không chặn.
   */
  async findPossibleDuplicates(input: DuplicateCheckInput): Promise<PossibleDuplicate[]> {
    const tons = Number(input.quantity_tons) || 0
    const price = Number(input.unit_price) || 0
    if (!isUuid(input.customer_id) || !input.grade || tons <= 0 || price <= 0) return []
    const ready = await familyPartiesReady()
    const day = input.order_date || todayVN()
    const parties = [...new Set([input.customer_id, ready ? input.ship_to_customer_id : null].filter(isUuid))]
    const cols = 'id, code, contract_no, status, grade, quantity_tons, unit_price, currency, order_date, created_at, customer_id, ' +
      (ready ? 'ship_to_customer_id, parent_order_id, ' : '') +
      'customer:sales_customers!customer_id(id, code, name, short_name, country)'
    let q = supabase
      .from('sales_orders')
      .select(cols)
      .neq('status', 'cancelled')
      .gte('order_date', addDaysStr(day, -7))
      .lte('order_date', addDaysStr(day, 7))
      .gte('quantity_tons', tons - 0.0005)
      .lte('quantity_tons', tons + 0.0005)
      .gte('unit_price', price * 0.995)
      .lte('unit_price', price * 1.005)
    q = ready
      ? q.or(`customer_id.in.(${parties.join(',')}),ship_to_customer_id.in.(${parties.join(',')})`)
      : q.eq('customer_id', input.customer_id)
    if (isUuid(input.exclude_id)) q = q.neq('id', input.exclude_id)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(20)
    if (error) throw new Error(`Không kiểm được đơn có thể trùng lô hàng: ${error.message}`)

    const normGrade = (g?: string | null) => (g || '').toUpperCase().replace(/[\s_]+/g, '')
    const cur = (c?: string | null) => (c || 'USD').toUpperCase()
    const rows = ((data || []) as any[])
      .filter((r) => normGrade(r.grade) === normGrade(input.grade) && cur(r.currency) === cur(input.currency))
      .map((r) => ({ ...r, customer: one(r.customer), ship_to_customer_id: r.ship_to_customer_id ?? null }))
    const withShip = await attachShipTo(rows)
    const root = input.family_root_id || null
    return withShip.map((r) => ({
      ...r,
      same_buyer: r.customer_id === input.customer_id,
      crossed: r.customer_id !== input.customer_id,
      same_family: !!root && (r.id === root || r.parent_order_id === root),
    })) as PossibleDuplicate[]
  },

  /**
   * Modal "Mua tiếp theo HĐ đã ký…": tìm HĐ GỐC theo số HĐ / mã SO / tên người mua (`q` trống = HĐ mới nhất),
   * lọc sẵn người mua nếu có `buyerId`. Ẩn đơn huỷ và đơn chưa có số HĐ; gõ số của một ĐỢT ra gốc của nó
   * (`matched_via`). Kèm số file HĐ ở gốc, số đơn cả họ và đơn mới nhất (làm đơn nguồn). Tối đa 30 HĐ.
   */
  async searchRootContracts(q: string, buyerId?: string | null): Promise<RootContractOption[]> {
    if (!(await familyPartiesReady())) throw new Error(NOT_READY_MSG)
    const term = searchSafe(q)
    let customerIds: string[] = []
    if (term) {
      const { data: custs, error: cErr } = await supabase
        .from('sales_customers')
        .select('id')
        .or(`name.ilike.%${term}%,short_name.ilike.%${term}%,code.ilike.%${term}%`)
        .limit(50)
      if (cErr) throw new Error(`Không tìm được người mua: ${cErr.message}`)
      customerIds = ((custs || []) as Array<{ id: string }>).map((c) => c.id)
    }

    let hq = supabase
      .from('sales_orders')
      .select(ROOT_OPTION_COLUMNS)
      .neq('status', 'cancelled')
    if (isUuid(buyerId)) hq = hq.eq('customer_id', buyerId)
    if (term) {
      hq = hq.or(
        `contract_no.ilike.%${term}%,code.ilike.%${term}%` +
        (customerIds.length ? `,customer_id.in.(${customerIds.join(',')})` : ''),
      )
    }
    const { data: hits, error: hErr } = await hq.order('order_date', { ascending: false }).limit(60)
    if (hErr) throw new Error(`Không tìm được HĐ: ${hErr.message}`)

    type Row = Omit<RootContractOption, 'contract_file_count' | 'family_size' | 'latest_member_id' | 'matched_via' | 'contract_no'>
      & { contract_no: string | null; parent_order_id: string | null; created_at: string }
    const hitRows = ((hits || []) as any[]).map((r) => ({ ...r, customer: one(r.customer) })) as Row[]
    const roots = new Map<string, Row>()
    const via = new Map<string, string>()
    for (const r of hitRows) {
      if (!r.parent_order_id) roots.set(r.id, r)
      else if (!via.has(r.parent_order_id)) via.set(r.parent_order_id, soDisplayCode(r))
    }
    // Gốc tự khớp tìm kiếm thì không cần ghi "khớp qua đợt …"
    for (const id of roots.keys()) via.delete(id)
    const missing = [...via.keys()]
    if (missing.length) {
      const { data: more, error: mErr } = await supabase
        .from('sales_orders')
        .select(ROOT_OPTION_COLUMNS)
        .in('id', missing)
        .neq('status', 'cancelled')
      if (mErr) throw new Error(`Không tải được HĐ gốc: ${mErr.message}`)
      for (const r of (more || []) as any[]) roots.set(r.id, { ...r, customer: one(r.customer) })
    }
    const list = [...roots.values()].filter((r) => (r.contract_no || '').trim() && !r.parent_order_id)
    if (list.length === 0) return []
    const ids = list.map((r) => r.id)

    const [kidsRes, docsRes] = await Promise.all([
      supabase.from('sales_orders').select('id, parent_order_id, order_date, created_at')
        .in('parent_order_id', ids).neq('status', 'cancelled'),
      supabase.from('sales_order_documents').select('sales_order_id')
        .in('sales_order_id', ids).eq('doc_type', 'contract').not('file_url', 'is', null),
    ])
    if (kidsRes.error) throw new Error(`Không đếm được các đợt mua tiếp: ${kidsRes.error.message}`)
    if (docsRes.error) throw new Error(`Không đếm được file HĐ: ${docsRes.error.message}`)
    const kidsBy = new Map<string, Array<{ id: string; order_date: string | null; created_at: string }>>()
    for (const k of (kidsRes.data || []) as Array<{ id: string; parent_order_id: string; order_date: string | null; created_at: string }>) {
      const arr = kidsBy.get(k.parent_order_id) || []
      arr.push(k)
      kidsBy.set(k.parent_order_id, arr)
    }
    const filesBy = new Map<string, number>()
    for (const d of (docsRes.data || []) as Array<{ sales_order_id: string }>) {
      filesBy.set(d.sales_order_id, (filesBy.get(d.sales_order_id) || 0) + 1)
    }
    const newer = (a: { order_date: string | null; created_at: string }, b: { order_date: string | null; created_at: string }) =>
      `${a.order_date || ''}|${a.created_at}` > `${b.order_date || ''}|${b.created_at}`

    return list
      .map((r): RootContractOption => {
        const kids = kidsBy.get(r.id) || []
        let latest: { id: string; order_date: string | null; created_at: string } = r
        for (const k of kids) if (newer(k, latest)) latest = k
        return {
          id: r.id,
          code: r.code,
          contract_no: (r.contract_no || '').trim(),
          contract_date: r.contract_date ?? null,
          order_date: r.order_date ?? null,
          status: r.status,
          customer_id: r.customer_id,
          customer: r.customer ?? null,
          currency: r.currency ?? null,
          grade: r.grade ?? null,
          quantity_tons: r.quantity_tons ?? null,
          contract_file_count: filesBy.get(r.id) || 0,
          family_size: 1 + kids.length,
          latest_member_id: latest.id,
          matched_via: via.get(r.id) ?? null,
        }
      })
      .sort((a, b) =>
        String(b.contract_date || b.order_date || '').localeCompare(String(a.contract_date || a.order_date || ''))
        || b.code.localeCompare(a.code))
      .slice(0, 30)
  },
}

export default salesOrderService
