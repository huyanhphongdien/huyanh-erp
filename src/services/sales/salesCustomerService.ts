// ============================================================================
// SALES CUSTOMER SERVICE — Service quản lý Khách hàng quốc tế
// File: src/services/sales/salesCustomerService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
import { businessPartnerService } from '../businessPartnerService'
import { normalizeHac13 } from '../../lib/hac13'
import type {
  SalesCustomer,
  CreateCustomerData,
  CustomerStatus,
  SalesCustomerListParams,
  SalesPaginatedResponse,
  CustomerStats,
  SalesOrder,
} from './salesTypes'
import { partyShortName } from './salesTypes'
import { salesOrderService } from './salesOrderService'

/** Một mục chọn khách gọn (ô Người nhận hàng, modal chọn) — gồm cả khách ngừng giao dịch để còn hiện/cảnh báo. */
export interface SalesCustomerPickerOption {
  id: string
  code: string | null
  name: string
  short_name: string | null
  country: string | null
  address: string | null
  status: CustomerStatus | null
}

/** Tấn đặt / tấn đã giao của một nhóm đơn (đọc từ v_sales_order_end_customer — KHÔNG có tiền). */
export interface TonsBucket {
  orders: number
  tons: number
  delivered_tons: number
}

/**
 * "HÀNG VỀ TAY" một khách cuối = mua thẳng (khách đứng tên, không qua trung gian) + nhận qua trung gian
 * (người mua khác đứng tên, khách này là người nhận). ⚠ Phần `via` KHÔNG BAO GIỜ thuộc công nợ / doanh thu /
 * hạn mức của khách này — công nợ luôn theo người mua.
 */
export interface EndCustomerVolume {
  direct: TonsBucket
  via: TonsBucket
  total: TonsBucket
  /** phần `via` gom theo người mua trung gian, nhiều tấn trước */
  byIntermediary: Array<TonsBucket & { buyer_id: string; name: string; short_name: string }>
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

// ============================================================================
// SERVICE
// ============================================================================

/** Cột được phép sắp xếp ở tầng DB. Giá trị khác rơi về 'name'. */
export const SORTABLE_CUSTOMER_COLUMNS: ReadonlySet<string> = new Set([
  'name', 'short_name', 'code', 'country', 'status',
  'created_at', 'updated_at', 'contact_person', 'email',
])

// ============================================================================
// custom_specs (jsonb) — "Yêu cầu kỹ thuật riêng" của khách
// Audit 17/11/2026: form cũ là ô TextArea bắt gõ JSON tay → CHUỖI được đẩy thẳng vào jsonb (lưu thành
// jsonb string), trang chi tiết Object.entries() trên chuỗi → vỡ thành từng ký tự, mở sửa lại hiện
// "[object Object]". Nay form là danh sách dòng "Thông số / Giá trị"; 2 hàm dưới đổi qua lại và
// đọc được cả bản cũ lỡ lưu thành chuỗi JSON.
// ============================================================================

export interface CustomSpecRow { key?: string; value?: string }

/** jsonb (object | chuỗi JSON cũ | chuỗi thường) → các dòng { key, value } cho Form.List / bảng hiển thị. */
export function customSpecsToRows(v: unknown): { key: string; value: string }[] {
  let obj: unknown = v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    try { obj = JSON.parse(s) } catch { return [{ key: 'Yêu cầu', value: s }] }
    if (typeof obj === 'string') return obj.trim() ? [{ key: 'Yêu cầu', value: obj }] : []
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
  return Object.entries(obj as Record<string, unknown>).map(([key, val]) => ({
    key,
    value: val === null || val === undefined ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val),
  }))
}

/** Các dòng form → object lưu jsonb. Bỏ dòng không có tên thông số; số thuần ("60", "0.03") lưu thành số. */
export function rowsToCustomSpecs(rows?: CustomSpecRow[] | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const r of rows || []) {
    const key = (r?.key || '').trim()
    if (!key) continue
    const raw = (r?.value ?? '').toString().trim()
    out[key] = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw
  }
  return out
}

/** Chặn ở tầng service: ai lỡ gửi CHUỖI cũng không lưu thành jsonb string nữa. */
function normalizeCustomSpecs(v: unknown): Record<string, unknown> | undefined {
  if (v === undefined) return undefined
  if (Array.isArray(v)) return rowsToCustomSpecs(v as CustomSpecRow[])
  if (v === null || typeof v === 'string') return rowsToCustomSpecs(customSpecsToRows(v))
  return typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export const salesCustomerService = {
  // ==========================================================================
  // LIST & QUERY
  // ==========================================================================

  /**
   * Lấy danh sách khách hàng với phân trang, tìm kiếm, lọc
   */
  async getList(
    params: SalesCustomerListParams = {},
  ): Promise<SalesPaginatedResponse<SalesCustomer>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      tier,
      country,
      sort_by = 'name',
      sort_order = 'asc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('sales_customers')
      .select('*', { count: 'exact' })

    // Lọc theo trạng thái
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Lọc theo hạng
    if (tier && tier !== 'all') {
      query = query.eq('tier', tier)
    }

    // Lọc theo quốc gia
    if (country) {
      query = query.eq('country', country)
    }

    // Tìm kiếm theo tên, mã (code = hac13_code đã sync), email, người liên hệ.
    // Cho phép paste HAC-13 dạng "8999-1-0001234-6" — normalize trước khi so.
    if (search) {
      const normalized = normalizeHac13(search)
      const candidate = /^\d{13}$/.test(normalized) ? normalized : search
      query = query.or(
        `name.ilike.%${candidate}%,code.ilike.%${candidate}%,email.ilike.%${candidate}%,contact_person.ilike.%${candidate}%`,
      )
    }

    // Sắp xếp — whitelist vì sort_by đi thẳng từ client vào .order();
    // tên cột không tồn tại thì PostgREST trả 400 và danh sách không tải được.
    const safeSortBy = SORTABLE_CUSTOMER_COLUMNS.has(sort_by) ? sort_by : 'name'
    query = query.order(safeSortBy, { ascending: sort_order === 'asc' })

    // Phân trang
    const { data, error, count } = await query.range(from, to)

    if (error) {
      throw new Error(`Không thể tải danh sách khách hàng: ${error.message}`)
    }

    return {
      data: (data || []) as SalesCustomer[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy tất cả khách hàng đang hoạt động (cho dropdown/select)
   */
  async getAllActive(): Promise<SalesCustomer[]> {
    const { data, error } = await supabase
      .from('sales_customers')
      .select('*')
      .eq('status', 'active')
      .order('name')

    if (error) {
      throw new Error(`Không thể tải khách hàng: ${error.message}`)
    }

    return (data || []) as SalesCustomer[]
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  /**
   * Lấy thông tin khách hàng theo ID, kèm số đơn hàng
   */
  async getById(id: string): Promise<SalesCustomer | null> {
    const { data, error } = await supabase
      .from('sales_customers')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(`Không thể tải thông tin khách hàng: ${error.message}`)
    }

    if (!data) return null

    // Đếm số đơn hàng của khách hàng
    const { count: orderCount } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id)

    return {
      ...(data as SalesCustomer),
      order_count: orderCount || 0,
    }
  },

  /**
   * Lấy khách hàng theo mã
   */
  async getByCode(code: string): Promise<SalesCustomer | null> {
    const { data, error } = await supabase
      .from('sales_customers')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (error) {
      throw new Error(`Không thể tải thông tin khách hàng: ${error.message}`)
    }

    return data as SalesCustomer | null
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Tạo khách hàng mới.
   *
   * Flow HAC-13 v10 (Phase 3+):
   *   1) Tạo Business Partner master (qua BP service / RPC) → nhận hac13_code.
   *   2) Insert sales_customers với bp_id; trigger BEFORE INSERT tự sync code = hac13_code.
   *
   * Atomic: nếu insert customer fail, BP đã tạo trở thành orphan — admin có thể merge sau.
   */
  async create(input: CreateCustomerData): Promise<SalesCustomer> {
    // Bước 1: tạo Business Partner (role CUSTOMER_INTL) qua RPC.
    const bp = await businessPartnerService.create({
      legal_name: input.name,
      short_name: input.short_name,
      country_iso: input.country || 'VN',
      address_line: input.address,
      phone: input.phone,
      email: input.email,
      roles: [
        {
          role_type: 'CUSTOMER_INTL',
          is_primary: true,
          role_data: {
            tier: input.tier ?? 'standard',
            default_incoterm: input.default_incoterm ?? 'FOB',
            default_currency: input.default_currency ?? 'USD',
            credit_limit: input.credit_limit,
            quality_standard: input.quality_standard ?? 'TCVN_3769',
            preferred_grades: input.preferred_grades,
            requires_pre_shipment_sample: input.requires_pre_shipment_sample ?? false,
            payment_terms: input.payment_terms,
            region: input.region,
            contact_person: input.contact_person,
            custom_specs: normalizeCustomSpecs(input.custom_specs),
          },
        },
      ],
    })

    // Bước 2: insert sales_customers, trigger DB tự fill code = bp.hac13_code.
    const { data, error } = await supabase
      .from('sales_customers')
      .insert({
        bp_id: bp.id,
        name: input.name,
        short_name: input.short_name || null,
        country: input.country || null,
        region: input.region || null,
        contact_person: input.contact_person || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        payment_terms: input.payment_terms || null,
        default_incoterm: input.default_incoterm || 'FOB',
        default_currency: input.default_currency || 'USD',
        credit_limit: input.credit_limit || null,
        quality_standard: input.quality_standard || 'TCVN_3769',
        custom_specs: normalizeCustomSpecs(input.custom_specs) ?? {},
        preferred_grades: input.preferred_grades || [],
        requires_pre_shipment_sample: input.requires_pre_shipment_sample ?? false,
        status: input.status || 'active',
        tier: input.tier || 'standard',
        notes: input.notes || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Không thể tạo khách hàng: ${error.message}`)
    }

    return data as SalesCustomer
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  /**
   * Cập nhật thông tin khách hàng.
   *
   * Đồng thời sync các field "general" (name, country, address, phone, email)
   * về business_partners master để mọi vai trò của BP (KH, NCC, đại lý B2B…)
   * thấy thông tin nhất quán.
   */
  async update(id: string, input: Partial<CreateCustomerData>): Promise<SalesCustomer> {
    // Lấy bp_id để biết BP nào cần sync
    const { data: existing, error: getErr } = await supabase
      .from('sales_customers')
      .select('bp_id')
      .eq('id', id)
      .maybeSingle()
    if (getErr) throw new Error(`Không thể đọc khách hàng: ${getErr.message}`)

    // Sync sang BP master (chỉ các field general)
    if (existing?.bp_id) {
      const bpPatch: Record<string, unknown> = {}
      if (input.name !== undefined) bpPatch.legal_name = input.name
      if (input.short_name !== undefined) bpPatch.short_name = input.short_name || null
      if (input.country !== undefined && input.country) bpPatch.country_iso = input.country
      if (input.address !== undefined) bpPatch.address_line = input.address || null
      if (input.phone !== undefined) bpPatch.phone = input.phone || null
      if (input.email !== undefined) bpPatch.email = input.email || null
      if (input.status === 'blacklisted') bpPatch.status = 'blocked'
      else if (input.status) bpPatch.status = input.status
      if (Object.keys(bpPatch).length > 0) {
        await businessPartnerService.update(existing.bp_id, bpPatch).catch((e) => {
          // Không fail toàn flow nếu BP sync lỗi (log lại để debug)
          console.error('[salesCustomerService.update] BP sync failed:', e)
        })
      }
    }

    const { data, error } = await supabase
      .from('sales_customers')
      .update({
        ...input,
        ...(input.custom_specs !== undefined ? { custom_specs: normalizeCustomSpecs(input.custom_specs) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(`Không thể cập nhật khách hàng: ${error.message}`)
    }

    return data as SalesCustomer
  },

  // ==========================================================================
  // DELETE (soft — chuyển sang inactive)
  // ==========================================================================

  /**
   * Xóa mềm khách hàng — chuyển trạng thái sang inactive
   * Không xóa vật lý để bảo toàn lịch sử đơn hàng
   */
  async delete(id: string): Promise<void> {
    // Kiểm tra khách hàng có đơn hàng đang xử lý không
    const { count } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id)
      .not('status', 'in', '("cancelled","paid","delivered")')

    if (count && count > 0) {
      throw new Error(
        `Không thể vô hiệu hóa khách hàng: còn ${count} đơn hàng đang xử lý`,
      )
    }

    const { error } = await supabase
      .from('sales_customers')
      .update({
        status: 'inactive' as CustomerStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể vô hiệu hóa khách hàng: ${error.message}`)
    }
  },

  // ==========================================================================
  // ORDER HISTORY
  // ==========================================================================

  /**
   * Đơn CHƯA HUỶ khách ĐỨNG TÊN MUA (customer_id), mới nhất trước — thống kê trang Khách (doanh thu, tấn) cộng từ
   * đây, nên bỏ đơn huỷ (trước 17/11/2026 cộng cả đơn huỷ). Đã migration thì kèm `ship_to` (đơn khách này mua rồi
   * giao thẳng cho người nhận khác — khối "Giao thẳng cho người nhận khác").
   */
  async getOrderHistory(customerId: string): Promise<SalesOrder[]> {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('customer_id', customerId)
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false })

    if (error) {
      throw new Error(`Không thể tải lịch sử đơn hàng: ${error.message}`)
    }

    const rows = (data || []) as SalesOrder[]
    return (await salesOrderService.familyPartiesReady()) ? await salesOrderService.attachShipTo(rows) : rows
  },

  /**
   * Đơn CHƯA HUỶ mà khách này là NGƯỜI NHẬN HÀNG qua trung gian (ship_to_customer_id = khách, người mua khác
   * đứng tên) — bảng "Nhận hàng qua trung gian — không thuộc công nợ khách này". `customer` = NGƯỜI MUA.
   * Chưa migration → [].
   */
  async getReceivedOrders(customerId: string): Promise<SalesOrder[]> {
    if (!(await salesOrderService.familyPartiesReady())) return []
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,code,name,short_name,country,tier)')
      .eq('ship_to_customer_id', customerId)
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false })
    if (error) throw new Error(`Không tải được đơn nhận hàng qua trung gian: ${error.message}`)
    return (data || []) as SalesOrder[]
  },

  /**
   * "Hàng về tay" khách cuối (tấn đặt + tấn đã giao), tách mua thẳng / nhận qua trung gian — MỘT nguồn
   * v_sales_order_end_customer ("đã giao" theo v_sales_order_container_delivery). KHÔNG có cột tiền: công nợ /
   * doanh thu luôn theo người mua. Chưa migration → null.
   */
  async getEndCustomerVolume(customerId: string): Promise<EndCustomerVolume | null> {
    if (!(await salesOrderService.familyPartiesReady())) return null
    const { data, error } = await supabase
      .from('v_sales_order_end_customer')
      .select('sales_order_id, buyer_id, via_intermediary, quantity_tons, delivered_tons')
      .eq('end_customer_id', customerId)
    if (error) throw new Error(`Không tải được sản lượng khách cuối: ${error.message}`)

    const empty = (): TonsBucket => ({ orders: 0, tons: 0, delivered_tons: 0 })
    const add = (b: TonsBucket, r: { quantity_tons: number | null; delivered_tons: number | null }) => {
      b.orders += 1
      b.tons += Number(r.quantity_tons) || 0
      b.delivered_tons += Number(r.delivered_tons) || 0
    }
    const direct = empty()
    const via = empty()
    const byBuyer = new Map<string, TonsBucket>()
    for (const r of (data || []) as Array<{ buyer_id: string; via_intermediary: boolean; quantity_tons: number | null; delivered_tons: number | null }>) {
      if (r.via_intermediary) {
        add(via, r)
        const b = byBuyer.get(r.buyer_id) || empty()
        add(b, r)
        byBuyer.set(r.buyer_id, b)
      } else {
        add(direct, r)
      }
    }
    const names = new Map<string, { name: string; short_name: string | null }>()
    const buyerIds = [...byBuyer.keys()]
    if (buyerIds.length) {
      const { data: custs, error: cErr } = await supabase.from('sales_customers').select('id, name, short_name').in('id', buyerIds)
      if (cErr) throw new Error(`Không tải được tên người mua trung gian: ${cErr.message}`)
      for (const c of (custs || []) as Array<{ id: string; name: string; short_name: string | null }>) names.set(c.id, c)
    }
    const fix = (b: TonsBucket): TonsBucket => ({ orders: b.orders, tons: round3(b.tons), delivered_tons: round3(b.delivered_tons) })
    return {
      direct: fix(direct),
      via: fix(via),
      total: fix({ orders: direct.orders + via.orders, tons: direct.tons + via.tons, delivered_tons: direct.delivered_tons + via.delivered_tons }),
      byIntermediary: buyerIds
        .map((id) => {
          const c = names.get(id)
          return { buyer_id: id, name: c?.name || '—', short_name: partyShortName(c), ...fix(byBuyer.get(id) as TonsBucket) }
        })
        .sort((a, b) => b.tons - a.tons),
    }
  },

  /**
   * Danh sách khách GỌN cho ô chọn Người nhận hàng / modal chọn (mọi trạng thái — khách ngừng giao dịch vẫn hiện
   * để còn cảnh báo), sắp theo tên.
   */
  async getPickerOptions(): Promise<SalesCustomerPickerOption[]> {
    const { data, error } = await supabase
      .from('sales_customers')
      .select('id, code, name, short_name, country, address, status')
      .order('name')
    if (error) throw new Error(`Không tải được danh sách khách hàng: ${error.message}`)
    return (data || []) as SalesCustomerPickerOption[]
  },

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Lấy thống kê tổng quan khách hàng
   */
  async getStats(): Promise<CustomerStats> {
    // Tổng số khách hàng
    const { count: total } = await supabase
      .from('sales_customers')
      .select('id', { count: 'exact', head: true })

    // Khách hàng đang hoạt động
    const { count: active } = await supabase
      .from('sales_customers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')

    // Khách hàng hạng Cao cấp
    const { count: premium } = await supabase
      .from('sales_customers')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'premium')
      .eq('status', 'active')

    // Khách hàng hạng Chiến lược
    const { count: strategic } = await supabase
      .from('sales_customers')
      .select('id', { count: 'exact', head: true })
      .eq('tier', 'strategic')
      .eq('status', 'active')

    return {
      total: total || 0,
      active: active || 0,
      premium: premium || 0,
      strategic: strategic || 0,
    }
  },
}

// ============================================================================
// HELPERS — generateCustomerCode() đã bị xoá ở Phase 3 (HAC-13 v10).
// Mã KH giờ là hac13_code do business_partners sinh tự động qua DB trigger.
// ============================================================================

export default salesCustomerService
