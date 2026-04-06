// ============================================================================
// SALES ORDER SERVICE — Service quản lý Đơn hàng bán quốc tế
// File: src/services/sales/salesOrderService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderContainer,
  ContainerType,
  Incoterm,
  PackingType,
  PaymentTerms,
} from './salesTypes'

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
  lc_number?: string
  lc_bank?: string
  lc_expiry_date?: string

  // Ghi chú
  notes?: string
  internal_notes?: string
}

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
}

export interface SalesOrderStats {
  total: number
  draft: number
  confirmed: number
  producing: number
  ready: number
  shipped: number
  total_value_usd_month: number
  orders_this_month: number
}

// ============================================================================
// CUSTOMER JOIN — dùng chung cho tất cả query cần join khách hàng
// ============================================================================

const CUSTOMER_JOIN = 'customer:sales_customers!customer_id(id,code,name,short_name,country,tier)'
const SELECT_WITH_CUSTOMER = `*,${CUSTOMER_JOIN}`

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

// ============================================================================
// SERVICE
// ============================================================================

export const salesOrderService = {
  // ==========================================================================
  // GENERATE CODE — SO-YYYY-XXXX
  // ==========================================================================

  /**
   * Sinh mã đơn hàng tự động: SO-2026-0001, SO-2026-0002, ...
   */
  async generateCode(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `SO-${year}-`

    const { data } = await supabase
      .from('sales_orders')
      .select('code')
      .like('code', `${prefix}%`)
      .order('code', { ascending: false })
      .limit(1)

    if (data && data.length > 0) {
      const lastCode = data[0].code // e.g. "SO-2026-0042"
      const lastNum = parseInt(lastCode.replace(prefix, ''), 10)
      if (!isNaN(lastNum)) {
        return `${prefix}${String(lastNum + 1).padStart(4, '0')}`
      }
    }

    return `${prefix}0001`
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

    let query = supabase
      .from('sales_orders')
      .select(SELECT_WITH_CUSTOMER, { count: 'exact' })

    // Lọc theo trạng thái
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Lọc theo khách hàng
    if (customer_id) {
      query = query.eq('customer_id', customer_id)
    }

    // Lọc theo cấp mủ
    if (grade) {
      query = query.eq('grade', grade)
    }

    // Lọc theo khoảng ngày đặt hàng
    if (date_from) {
      query = query.gte('order_date', date_from)
    }
    if (date_to) {
      query = query.lte('order_date', date_to)
    }

    // Tìm kiếm theo mã đơn, mã PO khách hàng, cấp mủ
    if (search) {
      query = query.or(
        `code.ilike.%${search}%,customer_po.ilike.%${search}%,grade.ilike.%${search}%`,
      )
    }

    // Sắp xếp
    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    // Phân trang
    const { data, error, count } = await query.range(from, to)

    if (error) {
      throw new Error(`Không thể tải danh sách đơn hàng: ${error.message}`)
    }

    return {
      data: (data || []) as SalesOrder[],
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
    const { data, error } = await supabase
      .from('sales_orders')
      .select(SELECT_WITH_CUSTOMER)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(`Không thể tải thông tin đơn hàng: ${error.message}`)
    }

    return data as SalesOrder | null
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================

  /**
   * Tạo đơn hàng mới — tự tính toán các trường phụ thuộc
   *
   * Auto-calculate:
   * - quantity_kg = quantity_tons × 1000
   * - total_bales = Math.ceil(quantity_kg / bale_weight_kg)
   * - container_count = Math.ceil(quantity_tons / (20ft→20 | 40ft→25))
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

    // Sinh mã tự động
    const code = await salesOrderService.generateCode()

    // Tính toán các trường tự động
    const baleWeight = input.bale_weight_kg || 33.33
    const quantityKg = input.quantity_tons * 1000
    const totalBales = Math.ceil(quantityKg / baleWeight)
    const containerType = input.container_type || '20ft'
    // Container 20ft: 600 bành (35kg) hoặc 630 bành (33.33kg) | 40ft: gấp đôi
    const balesPerContainer20ft = baleWeight >= 35 ? 600 : 630
    const balesPerContainer = containerType === '40ft' ? balesPerContainer20ft * 2 : balesPerContainer20ft
    const containerCount = Math.ceil(totalBales / balesPerContainer)
    const totalValueUsd = input.quantity_tons * input.unit_price
    const exchangeRate = input.exchange_rate || 0
    const totalValueVnd = exchangeRate > 0 ? totalValueUsd * exchangeRate : 0

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
        currency: input.currency || 'USD',
        exchange_rate: exchangeRate || null,
        total_value_usd: totalValueUsd,
        total_value_vnd: totalValueVnd || null,
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
        packing_type: input.packing_type || 'bale',
        bale_weight_kg: baleWeight,
        total_bales: totalBales,
        shrink_wrap: input.shrink_wrap ?? true,
        pallet_required: input.pallet_required ?? false,
        marking_instructions: input.marking_instructions || null,

        // Vận chuyển
        container_type: containerType,
        container_count: containerCount,
        shipping_line: input.shipping_line || null,
        vessel_name: input.vessel_name || null,
        booking_reference: input.booking_reference || null,

        // Ngày tháng
        order_date: input.order_date || new Date().toISOString().split('T')[0],
        delivery_date: input.delivery_date || null,
        etd: input.etd || null,
        eta: input.eta || null,

        // Thanh toán
        payment_terms: input.payment_terms || null,
        lc_number: input.lc_number || null,
        lc_bank: input.lc_bank || null,
        lc_expiry_date: input.lc_expiry_date || null,

        // Trạng thái mặc định
        status: 'draft' as SalesOrderStatus,

        // Chứng từ
        coa_generated: false,
        packing_list_generated: false,
        invoice_generated: false,
        bl_received: false,

        // Ghi chú
        notes: input.notes || null,
        internal_notes: input.internal_notes || null,
      })
      .select(SELECT_WITH_CUSTOMER)
      .single()

    if (error) {
      throw new Error(`Không thể tạo đơn hàng: ${error.message}`)
    }

    return data as SalesOrder
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
        `Không thể chỉnh sửa đơn hàng ở trạng thái "${existing.status}". Chỉ được sửa khi ở trạng thái Nháp hoặc Đã xác nhận.`,
      )
    }

    // Tính lại các trường phụ thuộc nếu có thay đổi liên quan
    const quantityTons = input.quantity_tons ?? existing.quantity_tons
    const unitPrice = input.unit_price ?? existing.unit_price
    const baleWeight = input.bale_weight_kg ?? existing.bale_weight_kg
    const containerType = input.container_type ?? existing.container_type ?? '20ft'
    const exchangeRate = input.exchange_rate ?? existing.exchange_rate ?? 0

    const recalculated: Record<string, unknown> = {}

    if (
      input.quantity_tons !== undefined ||
      input.bale_weight_kg !== undefined ||
      input.container_type !== undefined ||
      input.unit_price !== undefined ||
      input.exchange_rate !== undefined
    ) {
      const quantityKg = quantityTons * 1000
      const totalBales = Math.ceil(quantityKg / baleWeight)
      const maxTonsPerContainer = containerType === '20ft' ? 20 : 25
      const containerCount = Math.ceil(quantityTons / maxTonsPerContainer)
      const totalValueUsd = quantityTons * unitPrice
      const totalValueVnd = exchangeRate > 0 ? totalValueUsd * exchangeRate : 0

      recalculated.quantity_kg = quantityKg
      recalculated.total_bales = totalBales
      recalculated.container_count = containerCount
      recalculated.total_value_usd = totalValueUsd
      recalculated.total_value_vnd = totalValueVnd || null
    }

    const { data, error } = await supabase
      .from('sales_orders')
      .update({
        ...input,
        ...recalculated,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_WITH_CUSTOMER)
      .single()

    if (error) {
      throw new Error(`Không thể cập nhật đơn hàng: ${error.message}`)
    }

    return data as SalesOrder
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
    data?: { confirmed_by?: string; shipped_at?: string; reason?: string },
  ): Promise<void> {
    const existing = await salesOrderService.getById(id)
    if (!existing) {
      throw new Error('Đơn hàng không tồn tại')
    }

    const currentStatus = existing.status
    const allowed = VALID_TRANSITIONS[currentStatus]

    if (!allowed || !allowed.includes(newStatus)) {
      throw new Error(
        `Không thể chuyển trạng thái từ "${currentStatus}" sang "${newStatus}". Vui lòng kiểm tra lại quy trình.`,
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

    const { error } = await supabase
      .from('sales_orders')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể chuyển trạng thái đơn hàng: ${error.message}`)
    }
  },

  // ==========================================================================
  // CANCEL ORDER
  // ==========================================================================

  /**
   * Hủy đơn hàng — yêu cầu lý do hủy
   */
  async cancelOrder(id: string, reason: string): Promise<void> {
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
        `Không thể hủy đơn hàng ở trạng thái "${existing.status}". Đơn hàng đã xuất/giao/thanh toán không được phép hủy.`,
      )
    }

    if (existing.status === 'cancelled') {
      throw new Error('Đơn hàng đã được hủy trước đó')
    }

    const { error } = await supabase
      .from('sales_orders')
      .update({
        status: 'cancelled' as SalesOrderStatus,
        internal_notes: existing.internal_notes
          ? `${existing.internal_notes}\n[HỦY] ${reason}`
          : `[HỦY] ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw new Error(`Không thể hủy đơn hàng: ${error.message}`)
    }
  },

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Lấy thống kê tổng quan đơn hàng
   */
  async getStats(): Promise<SalesOrderStats> {
    // Tổng số đơn hàng
    const { count: total } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })

    // Đếm theo từng trạng thái song song
    const statusCounts = async (s: SalesOrderStatus) => {
      const { count } = await supabase
        .from('sales_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
      return count || 0
    }

    const [draft, confirmed, producing, ready, shipped] = await Promise.all([
      statusCounts('draft'),
      statusCounts('confirmed'),
      statusCounts('producing'),
      statusCounts('ready'),
      statusCounts('shipped'),
    ])

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
      shipped,
      total_value_usd_month: totalValueUsdMonth,
      orders_this_month: ordersThisMonth || 0,
    }
  },

  // ==========================================================================
  // GET BY CUSTOMER
  // ==========================================================================

  /**
   * Lấy danh sách đơn hàng của một khách hàng
   */
  async getByCustomer(customerId: string): Promise<SalesOrder[]> {
    const { data, error } = await supabase
      .from('sales_orders')
      .select(SELECT_WITH_CUSTOMER)
      .eq('customer_id', customerId)
      .order('order_date', { ascending: false })

    if (error) {
      throw new Error(`Không thể tải đơn hàng của khách hàng: ${error.message}`)
    }

    return (data || []) as SalesOrder[]
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
    const { data, error } = await supabase
      .from('sales_orders')
      .update({
        ...fields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_WITH_CUSTOMER)
      .single()

    if (error) throw new Error(`Không thể cập nhật: ${error.message}`)
    return data as SalesOrder
  },
}

export default salesOrderService
