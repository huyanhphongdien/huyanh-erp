// ============================================================================
// SALES CUSTOMER SERVICE — Service quản lý Khách hàng quốc tế
// File: src/services/sales/salesCustomerService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
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

    // Tìm kiếm theo tên, mã, email, người liên hệ
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,code.ilike.%${search}%,email.ilike.%${search}%,contact_person.ilike.%${search}%`,
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
   * Tạo khách hàng mới — tự sinh mã KH-XXX
   */
  async create(input: CreateCustomerData): Promise<SalesCustomer> {
    // Sinh mã khách hàng tự động: KH-001, KH-002, ...
    const code = await generateCustomerCode()

    const { data, error } = await supabase
      .from('sales_customers')
      .insert({
        code,
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
   * Cập nhật thông tin khách hàng
   */
  async update(id: string, input: Partial<CreateCustomerData>): Promise<SalesCustomer> {
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
// HELPERS
// ============================================================================

/**
 * Sinh mã khách hàng tự động: KH-001, KH-002, ...
 */
async function generateCustomerCode(): Promise<string> {
  const { data } = await supabase
    .from('sales_customers')
    .select('code')
    .like('code', 'KH-%')
    .order('code', { ascending: false })
    .limit(1)

  if (data && data.length > 0) {
    const lastCode = data[0].code // e.g. "KH-042"
    const lastNum = parseInt(lastCode.replace('KH-', ''), 10)
    if (!isNaN(lastNum)) {
      return `KH-${String(lastNum + 1).padStart(3, '0')}`
    }
  }

  return 'KH-001'
}

export default salesCustomerService
