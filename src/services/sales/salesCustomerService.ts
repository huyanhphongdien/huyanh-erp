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

// ============================================================================
// SERVICE
// ============================================================================

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

    // Sắp xếp
    query = query.order(sort_by, { ascending: sort_order === 'asc' })

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
            custom_specs: input.custom_specs,
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
        custom_specs: input.custom_specs || {},
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
   * Lấy lịch sử đơn hàng của khách hàng
   */
  async getOrderHistory(customerId: string): Promise<SalesOrder[]> {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false })

    if (error) {
      throw new Error(`Không thể tải lịch sử đơn hàng: ${error.message}`)
    }

    return (data || []) as SalesOrder[]
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
