// ============================================================================
// PURCHASE ORDER SERVICE
// File: src/services/purchaseOrderService.ts
// Huy Anh ERP System - Module Mua hàng - Phase 3.1 + Phase P5
// ============================================================================
// WORKFLOW ĐƠN GIẢN (không duyệt nội bộ):
//   draft → confirmed → partial → completed
//                    └→ cancelled
//
// - "Xác nhận" (confirm): draft → confirmed
// - "Hủy đơn" (cancel): draft/confirmed → cancelled (cần lý do)
// - "Chuyển trạng thái": confirmed → partial/completed, partial → completed
//
// Phê duyệt bên ngoài: lưu bằng chứng (số đề xuất, ngày, người duyệt, file)
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** Trạng thái đơn hàng (workflow đơn giản) */
export type POStatus =
  | 'draft'       // Nháp
  | 'confirmed'   // Đã xác nhận
  | 'partial'     // Đang giao (nhận 1 phần)
  | 'completed'   // Hoàn thành
  | 'cancelled'   // Đã hủy

/** Label tiếng Việt cho status */
export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  partial: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

/** Màu sắc cho status badge */
export const PO_STATUS_COLORS: Record<POStatus, string> = {
  draft: 'gray',
  confirmed: 'blue',
  partial: 'orange',
  completed: 'green',
  cancelled: 'gray',
}

/** Transitions hợp lệ */
const SIMPLE_TRANSITIONS: Record<POStatus, POStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partial', 'completed', 'cancelled'],
  partial: ['completed'],
  completed: [],
  cancelled: [],
}

/** Đơn hàng */
export interface PurchaseOrder {
  id: string
  order_code: string                // DH-2026-0001
  order_date: string                // YYYY-MM-DD

  // Thông tin dự án/công trình
  project_name?: string | null
  project_code?: string | null

  // Yêu cầu giao hàng
  expected_delivery_date?: string | null
  delivery_address?: string | null
  delivery_notes?: string | null

  // Người yêu cầu
  requester_id?: string | null
  department_id?: string | null

  // Tổng hợp tiền
  total_amount: number              // Tổng tiền hàng
  vat_amount: number                // Tổng VAT
  grand_total: number               // Tổng cộng (tiền hàng + VAT)

  // Tiến độ (%)
  invoice_progress: number          // % đã có hóa đơn
  payment_progress: number          // % đã thanh toán

  // ===== XÁC NHẬN (nội bộ) =====
  confirmed_by?: string | null
  confirmed_at?: string | null
  confirmed_by_name?: string | null  // Denormalized cho hiển thị nhanh

  // ===== PHÊ DUYỆT BÊN NGOÀI (bằng chứng) =====
  approval_number?: string | null    // Số đề xuất / Số phiếu duyệt
  approval_date?: string | null      // Ngày duyệt (YYYY-MM-DD)
  approved_by_name?: string | null   // Tên người duyệt (bên ngoài hệ thống)
  approval_documents?: any[] | null  // [{name, url, type, size}]

  // ===== HỦY =====
  cancelled_by?: string | null
  cancelled_at?: string | null
  cancelled_by_name?: string | null  // Denormalized
  cancellation_reason?: string | null

  // ===== XÁC NHẬN - FILES (Phase P5) =====
  confirmation_files?: string[] | null  // Mảng URLs file bằng chứng xác nhận

  // Trạng thái
  status: POStatus

  // Ghi chú
  notes?: string | null
  internal_notes?: string | null

  // Audit
  created_by?: string | null
  created_at: string
  updated_at: string

  // Relations (populated from joins)
  requester?: {
    id: string
    code: string
    full_name: string
  } | null
  department?: {
    id: string
    code: string
    name: string
  } | null
  creator?: {
    id: string
    code: string
    full_name: string
  } | null
  confirmer?: {
    id: string
    full_name: string
  } | null

  // Computed
  items_count?: number
  suppliers_count?: number
}

/** Chi tiết đơn hàng (1 dòng = 1 vật tư + 1 NCC) */
export interface PurchaseOrderItem {
  id: string
  order_id: string
  material_id?: string | null
  supplier_id: string
  quotation_id?: string | null

  // Thông tin vật tư (snapshot - lưu tại thời điểm tạo)
  material_code?: string | null
  material_name: string
  specifications?: string | null
  unit: string

  // Số lượng & giá
  quantity: number
  unit_price: number
  vat_rate: number                  // % VAT (mặc định 10)
  amount: number                    // = quantity * unit_price
  vat_amount: number                // = amount * vat_rate / 100
  total_amount: number              // = amount + vat_amount

  // Tiến độ hóa đơn
  invoiced_quantity: number
  invoiced_amount: number

  // Khác
  notes?: string | null
  sort_order: number
  created_at: string
  updated_at: string

  // Relations
  material?: {
    id: string
    code: string
    name: string
    unit?: string
  } | null
  supplier?: {
    id: string
    code: string
    name: string
    short_name?: string
  } | null
}

/** Lịch sử đơn hàng */
export interface PurchaseOrderHistory {
  id: string
  order_id: string
  action: string
  old_value?: any
  new_value?: any
  description?: string | null
  details?: any                     // Extra data (e.g. reason)
  performed_by?: string | null
  performed_at: string

  // Relations
  performer?: {
    id: string
    full_name: string
  } | null
}

/** Form data để tạo/sửa đơn hàng */
export interface POFormData {
  order_date: string
  project_name?: string
  project_code?: string
  expected_delivery_date?: string
  delivery_address?: string
  delivery_notes?: string
  requester_id?: string
  department_id?: string
  notes?: string
  internal_notes?: string
  // Approval evidence (có thể cập nhật lúc sửa)
  approval_number?: string
  approval_date?: string
  approved_by_name?: string
  approval_documents?: any[]
}

/** Form data cho chi tiết đơn hàng */
export interface POItemFormData {
  material_id?: string
  supplier_id: string
  material_code?: string
  material_name: string
  specifications?: string
  unit: string
  quantity: number
  unit_price: number
  vat_rate?: number               // Default 10%
  notes?: string
  sort_order?: number
}

/** Filter cho danh sách đơn hàng */
export interface POFilter {
  search?: string                 // Tìm theo mã đơn, tên dự án
  status?: POStatus | POStatus[]
  supplier_id?: string            // Lọc theo NCC (qua items)
  department_id?: string
  requester_id?: string
  created_by?: string
  date_from?: string
  date_to?: string
  min_amount?: number
  max_amount?: number
}

/** Response phân trang */
export interface POListResponse {
  data: PurchaseOrder[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Tổng hợp theo NCC */
export interface POSupplierSummary {
  supplier_id: string
  supplier_code: string
  supplier_name: string
  supplier_short_name?: string
  items: PurchaseOrderItem[]
  subtotal: number                // Tổng tiền hàng
  vat_total: number               // Tổng VAT
  grand_total: number             // Tổng cộng
  items_count: number
}

/** Thống kê đơn hàng */
export interface POStats {
  total_orders: number
  total_amount: number
  draft_count: number
  confirmed_count: number
  partial_count: number
  completed_count: number
  cancelled_count: number
  overdue_count: number           // Quá hạn giao hàng
}

// ============================================================================
// TYPES BỔ SUNG - PHASE P5 (Invoice & Payment)
// ============================================================================

/** Tổng hợp hóa đơn + thanh toán cho 1 đơn hàng */
export interface OrderInvoiceSummary {
  order_id: string
  order_code: string
  grand_total: number
  // Hóa đơn
  invoice_count: number
  total_invoiced: number
  invoice_progress: number // %
  // Thanh toán
  total_paid: number
  total_remaining: number
  payment_progress: number // %
  // Overdue
  overdue_count: number
  overdue_amount: number
}

/** Chi tiết hóa đơn + payments theo NCC trong 1 đơn hàng */
export interface OrderSupplierInvoiceBreakdown {
  supplier_id: string
  supplier_code: string
  supplier_name: string
  // Từ đơn hàng
  order_subtotal: number     // Tổng tiền items của NCC trong đơn
  order_item_count: number
  // Hóa đơn
  invoices: OrderInvoiceDetail[]
  total_invoiced: number
  invoice_progress: number
  // Thanh toán
  total_paid: number
  payment_progress: number
  remaining: number
}

/** Chi tiết 1 hóa đơn trong breakdown */
export interface OrderInvoiceDetail {
  id: string
  invoice_code: string
  invoice_number: string | null
  invoice_date: string
  due_date: string | null
  total_amount: number
  paid_amount: number
  remaining_amount: number
  status: string
  is_overdue: boolean
  days_overdue: number
  image_urls: string[] | null
  notes: string | null
  created_by_name: string | null
  created_at: string
  // Thanh toán
  payments: InvoicePaymentDetail[]
}

/** Chi tiết 1 thanh toán trong breakdown */
export interface InvoicePaymentDetail {
  id: string
  payment_date: string
  amount: number
  payment_method: string
  reference_number: string | null
  bank_name: string | null
  notes: string | null
  created_by_name: string | null
  created_at: string
}

/** Dữ liệu cho cột tiến độ trong POListPage */
export interface OrderProgressInfo {
  order_id: string
  invoice_progress: number
  payment_progress: number
  invoice_count: number
  overdue_count: number
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Tính toán amount, vat_amount, total_amount cho 1 item
 */
export function calculateItemAmounts(
  quantity: number,
  unitPrice: number,
  vatRate: number = 10
): {
  amount: number
  vat_amount: number
  total_amount: number
} {
  const amount = Math.round(quantity * unitPrice * 100) / 100
  const vat_amount = Math.round(amount * vatRate / 100 * 100) / 100
  const total_amount = Math.round((amount + vat_amount) * 100) / 100

  return { amount, vat_amount, total_amount }
}

/**
 * Tính tổng đơn hàng từ danh sách items
 */
export function calculateOrderTotals(items: PurchaseOrderItem[]): {
  total_amount: number
  vat_amount: number
  grand_total: number
} {
  const total_amount = items.reduce((sum, item) => sum + (item.amount || 0), 0)
  const vat_amount = items.reduce((sum, item) => sum + (item.vat_amount || 0), 0)
  const grand_total = items.reduce((sum, item) => sum + (item.total_amount || 0), 0)

  return {
    total_amount: Math.round(total_amount * 100) / 100,
    vat_amount: Math.round(vat_amount * 100) / 100,
    grand_total: Math.round(grand_total * 100) / 100,
  }
}

/**
 * Nhóm items theo NCC (supplier)
 */
export function groupItemsBySupplier(items: PurchaseOrderItem[]): POSupplierSummary[] {
  const grouped = new Map<string, POSupplierSummary>()

  for (const item of items) {
    const supplierId = item.supplier_id

    if (!grouped.has(supplierId)) {
      grouped.set(supplierId, {
        supplier_id: supplierId,
        supplier_code: item.supplier?.code || '',
        supplier_name: item.supplier?.name || '',
        supplier_short_name: item.supplier?.short_name,
        items: [],
        subtotal: 0,
        vat_total: 0,
        grand_total: 0,
        items_count: 0,
      })
    }

    const summary = grouped.get(supplierId)!
    summary.items.push(item)
    summary.subtotal += item.amount || 0
    summary.vat_total += item.vat_amount || 0
    summary.grand_total += item.total_amount || 0
    summary.items_count += 1
  }

  // Round totals
  for (const summary of grouped.values()) {
    summary.subtotal = Math.round(summary.subtotal * 100) / 100
    summary.vat_total = Math.round(summary.vat_total * 100) / 100
    summary.grand_total = Math.round(summary.grand_total * 100) / 100
  }

  return Array.from(grouped.values())
}

/**
 * Format số tiền VNĐ
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Kiểm tra status transition hợp lệ (2 tham số → boolean)
 */
export function canTransitionTo(currentStatus: POStatus, targetStatus: POStatus): boolean {
  return SIMPLE_TRANSITIONS[currentStatus]?.includes(targetStatus) || false
}

/**
 * Lấy danh sách status có thể chuyển từ status hiện tại (1 tham số → array)
 */
export function getAvailableTransitions(currentStatus: POStatus): POStatus[] {
  return SIMPLE_TRANSITIONS[currentStatus] || []
}

// ============================================================================
// SELECT QUERIES (reusable)
// ============================================================================

const PO_SELECT = `
  *,
  requester:employees!purchase_orders_requester_id_fkey(
    id, code, full_name
  ),
  department:departments!purchase_orders_department_id_fkey(
    id, code, name
  ),
  creator:employees!purchase_orders_created_by_fkey(
    id, code, full_name
  )
`

const PO_ITEM_SELECT = `
  *,
  material:materials!purchase_order_items_material_id_fkey(
    id, code, name, unit_name
  ),
  supplier:suppliers!purchase_order_items_supplier_id_fkey(
    id, code, name, short_name
  )
`

const PO_HISTORY_SELECT = `
  *,
  performer:employees!purchase_order_history_performed_by_fkey(
    id, full_name
  )
`

// ============================================================================
// SERVICE
// ============================================================================

export const purchaseOrderService = {

  // ==========================================================================
  // PURCHASE ORDER CRUD
  // ==========================================================================

  /**
   * Lấy danh sách đơn hàng có filter và phân trang
   */
  async getAll(
    page = 1,
    pageSize = 10,
    filter?: POFilter
  ): Promise<POListResponse> {
    console.log('📋 [poService.getAll] Called with:', { page, pageSize, filter })

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('purchase_orders')
      .select(PO_SELECT, { count: 'exact' })

    // ===== APPLY FILTERS =====

    // Tìm kiếm theo mã đơn hoặc tên dự án
    if (filter?.search) {
      const term = `%${filter.search}%`
      query = query.or(`order_code.ilike.${term},project_name.ilike.${term}`)
    }

    // Lọc theo trạng thái
    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        query = query.in('status', filter.status)
      } else {
        query = query.eq('status', filter.status)
      }
    }

    // Lọc theo phòng ban
    if (filter?.department_id) {
      query = query.eq('department_id', filter.department_id)
    }

    // Lọc theo người yêu cầu
    if (filter?.requester_id) {
      query = query.eq('requester_id', filter.requester_id)
    }

    // Lọc theo người tạo
    if (filter?.created_by) {
      query = query.eq('created_by', filter.created_by)
    }

    // Lọc theo khoảng ngày
    if (filter?.date_from) {
      query = query.gte('order_date', filter.date_from)
    }
    if (filter?.date_to) {
      query = query.lte('order_date', filter.date_to)
    }

    // Lọc theo khoảng tiền
    if (filter?.min_amount) {
      query = query.gte('grand_total', filter.min_amount)
    }
    if (filter?.max_amount) {
      query = query.lte('grand_total', filter.max_amount)
    }

    // Sắp xếp và phân trang
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('❌ [poService.getAll] Error:', error)
      throw error
    }

    console.log('✅ [poService.getAll] Result:', { count, returned: data?.length })

    return {
      data: (data || []) as PurchaseOrder[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy đơn hàng theo ID
   */
  async getById(id: string): Promise<PurchaseOrder | null> {
    console.log('🔍 [poService.getById] ID:', id)

    const { data, error } = await supabase
      .from('purchase_orders')
      .select(PO_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      console.error('❌ [poService.getById] Error:', error)
      throw error
    }

    return data as PurchaseOrder
  },

  /**
   * Lấy đơn hàng theo mã (order_code)
   */
  async getByCode(orderCode: string): Promise<PurchaseOrder | null> {
    console.log('🔍 [poService.getByCode] Code:', orderCode)

    const { data, error } = await supabase
      .from('purchase_orders')
      .select(PO_SELECT)
      .eq('order_code', orderCode)
      .maybeSingle()

    if (error) {
      console.error('❌ [poService.getByCode] Error:', error)
      throw error
    }

    return data as PurchaseOrder | null
  },

  /**
   * Tạo đơn hàng mới (luôn bắt đầu ở draft)
   */
  async create(
    formData: POFormData,
    createdBy: string
  ): Promise<PurchaseOrder> {
    console.log('➕ [poService.create] Creating new PO')

    // Generate mã đơn hàng
    const orderCode = await this.generateOrderCode()

    const insertData = {
      order_code: orderCode,
      order_date: formData.order_date || new Date().toISOString().split('T')[0],
      project_name: formData.project_name || null,
      project_code: formData.project_code || null,
      expected_delivery_date: formData.expected_delivery_date || null,
      delivery_address: formData.delivery_address || null,
      delivery_notes: formData.delivery_notes || null,
      requester_id: formData.requester_id || null,
      department_id: formData.department_id || null,
      notes: formData.notes || null,
      internal_notes: formData.internal_notes || null,
      // Approval evidence (có thể nhập lúc tạo)
      approval_number: formData.approval_number || null,
      approval_date: formData.approval_date || null,
      approved_by_name: formData.approved_by_name || null,
      approval_documents: formData.approval_documents || null,
      // Defaults
      status: 'draft' as POStatus,
      total_amount: 0,
      vat_amount: 0,
      grand_total: 0,
      invoice_progress: 0,
      payment_progress: 0,
      created_by: createdBy,
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert(insertData)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.create] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(data.id, 'created', createdBy, {
      description: `Tạo đơn hàng ${orderCode}`,
    })

    console.log('✅ [poService.create] Created:', orderCode)
    return data as PurchaseOrder
  },

  /**
   * Cập nhật đơn hàng (chỉ draft)
   */
  async update(
    id: string,
    formData: Partial<POFormData>,
    updatedBy: string
  ): Promise<PurchaseOrder> {
    console.log('📝 [poService.update] ID:', id)

    // Kiểm tra PO có thể sửa không (chỉ draft)
    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')
    if (currentPO.status !== 'draft') {
      throw new Error(`Không thể sửa đơn hàng ở trạng thái "${PO_STATUS_LABELS[currentPO.status]}"`)
    }

    const updateData = {
      ...formData,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.update] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(id, 'updated', updatedBy, {
      description: 'Cập nhật thông tin đơn hàng',
      old_value: {
        project_name: currentPO.project_name,
        expected_delivery_date: currentPO.expected_delivery_date,
      },
      new_value: {
        project_name: formData.project_name,
        expected_delivery_date: formData.expected_delivery_date,
      },
    })

    console.log('✅ [poService.update] Updated:', id)
    return data as PurchaseOrder
  },

  /**
   * Cập nhật thông tin phê duyệt bên ngoài (cho mọi status trừ cancelled)
   */
  async updateApprovalEvidence(
    id: string,
    approvalData: {
      approval_number?: string
      approval_date?: string
      approved_by_name?: string
      approval_documents?: any[]
    },
    updatedBy: string
  ): Promise<PurchaseOrder> {
    console.log('📎 [poService.updateApprovalEvidence] ID:', id)

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')
    if (currentPO.status === 'cancelled') {
      throw new Error('Không thể cập nhật thông tin phê duyệt cho đơn hàng đã hủy')
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }
    if (approvalData.approval_number !== undefined) {
      updatePayload.approval_number = approvalData.approval_number || null
    }
    if (approvalData.approval_date !== undefined) {
      updatePayload.approval_date = approvalData.approval_date || null
    }
    if (approvalData.approved_by_name !== undefined) {
      updatePayload.approved_by_name = approvalData.approved_by_name || null
    }
    if (approvalData.approval_documents !== undefined) {
      updatePayload.approval_documents = approvalData.approval_documents || null
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updatePayload)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.updateApprovalEvidence] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(id, 'updated', updatedBy, {
      description: 'Cập nhật thông tin phê duyệt bên ngoài',
    })

    console.log('✅ [poService.updateApprovalEvidence] Updated')
    return data as PurchaseOrder
  },

  /**
   * Xóa đơn hàng (chỉ xóa được khi draft)
   */
  async delete(id: string): Promise<void> {
    console.log('🗑️ [poService.delete] ID:', id)

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')
    if (currentPO.status !== 'draft') {
      throw new Error('Chỉ có thể xóa đơn hàng ở trạng thái Nháp')
    }

    // Xóa items trước
    const { error: itemError } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('order_id', id)

    if (itemError) {
      console.error('❌ [poService.delete] Error deleting items:', itemError)
      throw itemError
    }

    // Xóa history
    const { error: historyError } = await supabase
      .from('purchase_order_history')
      .delete()
      .eq('order_id', id)

    if (historyError) {
      console.error('❌ [poService.delete] Error deleting history:', historyError)
      // Không throw, tiếp tục xóa PO
    }

    // Xóa PO
    const { error } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('❌ [poService.delete] Error:', error)
      throw error
    }

    console.log('✅ [poService.delete] Deleted:', id)
  },

  // ==========================================================================
  // STATUS MANAGEMENT (WORKFLOW ĐƠN GIẢN)
  // ==========================================================================

  /**
   * Cập nhật trạng thái đơn hàng (dùng cho status_changed chung)
   */
  async updateStatus(
    id: string,
    newStatus: POStatus,
    userId: string
  ): Promise<PurchaseOrder> {
    console.log('📊 [poService.updateStatus] ID:', id, 'NewStatus:', newStatus)

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')

    // Kiểm tra transition hợp lệ
    if (!canTransitionTo(currentPO.status, newStatus)) {
      throw new Error(
        `Không thể chuyển từ "${PO_STATUS_LABELS[currentPO.status]}" sang "${PO_STATUS_LABELS[newStatus]}"`
      )
    }

    const updateData: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.updateStatus] Error:', error)
      throw error
    }

    // Ghi lịch sử
    const descriptionMap: Record<string, string> = {
      partial: 'Chuyển sang Đang giao (nhận 1 phần)',
      completed: 'Đơn hàng hoàn thành',
    }

    await this.addHistory(id, 'status_changed', userId, {
      description: descriptionMap[newStatus] || `Chuyển trạng thái sang ${PO_STATUS_LABELS[newStatus]}`,
      old_value: { status: currentPO.status },
      new_value: { status: newStatus },
    })

    console.log('✅ [poService.updateStatus]', currentPO.status, '→', newStatus)
    return data as PurchaseOrder
  },

  /**
   * XÁC NHẬN đơn hàng (draft → confirmed)
   */
  async confirm(id: string, userId: string): Promise<PurchaseOrder> {
    console.log('✅ [poService.confirm] ID:', id)

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')

    if (currentPO.status !== 'draft') {
      throw new Error(`Chỉ có thể xác nhận đơn hàng ở trạng thái Nháp (hiện tại: ${PO_STATUS_LABELS[currentPO.status]})`)
    }

    // Kiểm tra có items không
    const items = await this.getItems(id)
    if (items.length === 0) {
      throw new Error('Đơn hàng phải có ít nhất 1 vật tư trước khi xác nhận')
    }

    // Kiểm tra grand_total > 0
    if (currentPO.grand_total <= 0) {
      throw new Error('Đơn hàng phải có tổng tiền > 0 trước khi xác nhận')
    }

    // Lấy tên người xác nhận
    const { data: employeeData } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', userId)
      .single()

    const confirmerName = employeeData?.full_name || null

    const now = new Date().toISOString()
    const updateData: Record<string, any> = {
      status: 'confirmed' as POStatus,
      confirmed_by: userId,
      confirmed_at: now,
      confirmed_by_name: confirmerName,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.confirm] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(id, 'confirmed', userId, {
      description: `Xác nhận đơn hàng${confirmerName ? ' bởi ' + confirmerName : ''}`,
      old_value: { status: 'draft' },
      new_value: { status: 'confirmed' },
    })

    console.log('✅ [poService.confirm] draft → confirmed')
    return data as PurchaseOrder
  },

  /**
   * XÁC NHẬN đơn hàng VỚI FILE bằng chứng (draft → confirmed)
   * Dùng cho ConfirmOrderModal trong PODetailPage
   */
  async confirmWithFiles(
    id: string,
    userId: string,
    confirmationFileUrls: string[]
  ): Promise<PurchaseOrder> {
    console.log('✅ [poService.confirmWithFiles] ID:', id, 'Files:', confirmationFileUrls.length)

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')

    if (currentPO.status !== 'draft') {
      throw new Error(`Chỉ có thể xác nhận đơn hàng ở trạng thái Nháp (hiện tại: ${PO_STATUS_LABELS[currentPO.status]})`)
    }

    // Kiểm tra có items không
    const items = await this.getItems(id)
    if (items.length === 0) {
      throw new Error('Đơn hàng phải có ít nhất 1 vật tư trước khi xác nhận')
    }

    // Kiểm tra grand_total > 0
    if (currentPO.grand_total <= 0) {
      throw new Error('Đơn hàng phải có tổng tiền > 0 trước khi xác nhận')
    }

    // Kiểm tra có file bằng chứng
    if (!confirmationFileUrls || confirmationFileUrls.length === 0) {
      throw new Error('Vui lòng upload ít nhất 1 file bằng chứng xác nhận')
    }

    // Lấy tên người xác nhận
    const { data: employeeData } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', userId)
      .single()

    const confirmerName = employeeData?.full_name || null

    const now = new Date().toISOString()
    const updateData: Record<string, any> = {
      status: 'confirmed' as POStatus,
      confirmed_by: userId,
      confirmed_at: now,
      confirmed_by_name: confirmerName,
      confirmation_files: confirmationFileUrls,
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.confirmWithFiles] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(id, 'confirmed', userId, {
      description: `Xác nhận đơn hàng${confirmerName ? ' bởi ' + confirmerName : ''} (${confirmationFileUrls.length} file bằng chứng)`,
      old_value: { status: 'draft' },
      new_value: { status: 'confirmed', confirmation_files: confirmationFileUrls },
    })

    console.log('✅ [poService.confirmWithFiles] draft → confirmed with', confirmationFileUrls.length, 'files')
    return data as PurchaseOrder
  },

  /**
   * HỦY đơn hàng (draft/confirmed → cancelled, cần lý do)
   */
  async cancel(id: string, userId: string, reason: string): Promise<PurchaseOrder> {
    console.log('❌ [poService.cancel] ID:', id)

    if (!reason?.trim()) {
      throw new Error('Vui lòng nhập lý do hủy đơn hàng')
    }

    const currentPO = await this.getById(id)
    if (!currentPO) throw new Error('Không tìm thấy đơn hàng')

    if (!['draft', 'confirmed'].includes(currentPO.status)) {
      throw new Error(
        `Không thể hủy đơn hàng ở trạng thái "${PO_STATUS_LABELS[currentPO.status]}". Chỉ hủy được khi Nháp hoặc Đã xác nhận.`
      )
    }

    // Lấy tên người hủy
    const { data: employeeData } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', userId)
      .single()

    const cancellerName = employeeData?.full_name || null

    const now = new Date().toISOString()
    const updateData: Record<string, any> = {
      status: 'cancelled' as POStatus,
      cancelled_by: userId,
      cancelled_at: now,
      cancelled_by_name: cancellerName,
      cancellation_reason: reason.trim(),
      updated_at: now,
    }

    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select(PO_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.cancel] Error:', error)
      throw error
    }

    // Ghi lịch sử
    await this.addHistory(id, 'cancelled', userId, {
      description: `Hủy đơn hàng: ${reason.trim()}`,
      old_value: { status: currentPO.status },
      new_value: { status: 'cancelled' },
      details: { reason: reason.trim() },
    })

    console.log('✅ [poService.cancel]', currentPO.status, '→ cancelled')
    return data as PurchaseOrder
  },

  // ==========================================================================
  // ORDER ITEMS
  // ==========================================================================

  /**
   * Lấy danh sách items của đơn hàng
   */
  async getItems(orderId: string): Promise<PurchaseOrderItem[]> {
    console.log('📦 [poService.getItems] Order:', orderId)

    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(PO_ITEM_SELECT)
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('❌ [poService.getItems] Error:', error)
      throw error
    }

    return (data || []) as PurchaseOrderItem[]
  },

  /**
   * Lấy items nhóm theo NCC
   */
  async getItemsBySupplier(orderId: string): Promise<POSupplierSummary[]> {
    const items = await this.getItems(orderId)
    return groupItemsBySupplier(items)
  },

  /**
   * Thêm item vào đơn hàng
   */
  async addItem(
    orderId: string,
    itemData: POItemFormData
  ): Promise<PurchaseOrderItem> {
    console.log('➕ [poService.addItem] Order:', orderId)

    // Kiểm tra PO có thể sửa không (chỉ draft)
    const po = await this.getById(orderId)
    if (!po) throw new Error('Không tìm thấy đơn hàng')
    if (po.status !== 'draft') {
      throw new Error(`Không thể thêm vật tư khi đơn hàng ở trạng thái "${PO_STATUS_LABELS[po.status]}"`)
    }

    // Tính toán amounts
    const vatRate = itemData.vat_rate ?? 10
    const { amount, vat_amount, total_amount } = calculateItemAmounts(
      itemData.quantity,
      itemData.unit_price,
      vatRate
    )

    // Lấy sort_order tiếp theo
    const { data: maxSortData } = await supabase
      .from('purchase_order_items')
      .select('sort_order')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextSortOrder = (maxSortData?.[0]?.sort_order || 0) + 1

    const insertData = {
      order_id: orderId,
      material_id: itemData.material_id || null,
      supplier_id: itemData.supplier_id,
      material_code: itemData.material_code || null,
      material_name: itemData.material_name,
      specifications: itemData.specifications || null,
      unit: itemData.unit,
      quantity: itemData.quantity,
      unit_price: itemData.unit_price,
      vat_rate: vatRate,
      amount,
      vat_amount,
      total_amount,
      invoiced_quantity: 0,
      invoiced_amount: 0,
      notes: itemData.notes || null,
      sort_order: itemData.sort_order ?? nextSortOrder,
    }

    const { data, error } = await supabase
      .from('purchase_order_items')
      .insert(insertData)
      .select(PO_ITEM_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.addItem] Error:', error)
      throw error
    }

    // Cập nhật tổng đơn hàng
    await this.recalculateOrderTotals(orderId)

    console.log('✅ [poService.addItem] Added item:', data.id)
    return data as PurchaseOrderItem
  },

  /**
   * Thêm nhiều items cùng lúc
   */
  async addItems(
    orderId: string,
    itemsData: POItemFormData[]
  ): Promise<PurchaseOrderItem[]> {
    console.log('➕ [poService.addItems] Order:', orderId, 'Count:', itemsData.length)

    // Kiểm tra PO
    const po = await this.getById(orderId)
    if (!po) throw new Error('Không tìm thấy đơn hàng')
    if (po.status !== 'draft') {
      throw new Error(`Không thể thêm vật tư khi đơn hàng ở trạng thái "${PO_STATUS_LABELS[po.status]}"`)
    }

    // Lấy sort_order hiện tại
    const { data: maxSortData } = await supabase
      .from('purchase_order_items')
      .select('sort_order')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: false })
      .limit(1)

    let nextSortOrder = (maxSortData?.[0]?.sort_order || 0) + 1

    const insertItems = itemsData.map((item) => {
      const vatRate = item.vat_rate ?? 10
      const { amount, vat_amount, total_amount } = calculateItemAmounts(
        item.quantity, item.unit_price, vatRate
      )

      return {
        order_id: orderId,
        material_id: item.material_id || null,
        supplier_id: item.supplier_id,
        material_code: item.material_code || null,
        material_name: item.material_name,
        specifications: item.specifications || null,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: vatRate,
        amount,
        vat_amount,
        total_amount,
        invoiced_quantity: 0,
        invoiced_amount: 0,
        notes: item.notes || null,
        sort_order: item.sort_order ?? nextSortOrder++,
      }
    })

    const { data, error } = await supabase
      .from('purchase_order_items')
      .insert(insertItems)
      .select(PO_ITEM_SELECT)

    if (error) {
      console.error('❌ [poService.addItems] Error:', error)
      throw error
    }

    // Cập nhật tổng
    await this.recalculateOrderTotals(orderId)

    console.log('✅ [poService.addItems] Added', data?.length, 'items')
    return (data || []) as PurchaseOrderItem[]
  },

  /**
   * Cập nhật item
   */
  async updateItem(
    itemId: string,
    itemData: Partial<POItemFormData>
  ): Promise<PurchaseOrderItem> {
    console.log('📝 [poService.updateItem] Item:', itemId)

    // Lấy item hiện tại để biết order_id
    const { data: currentItem, error: fetchError } = await supabase
      .from('purchase_order_items')
      .select('order_id, quantity, unit_price, vat_rate')
      .eq('id', itemId)
      .single()

    if (fetchError || !currentItem) {
      throw new Error('Không tìm thấy chi tiết đơn hàng')
    }

    // Kiểm tra PO status
    const po = await this.getById(currentItem.order_id)
    if (!po || po.status !== 'draft') {
      throw new Error('Không thể sửa chi tiết khi đơn hàng không ở trạng thái Nháp')
    }

    // Tính lại amounts nếu có thay đổi quantity/price/vat
    const quantity = itemData.quantity ?? currentItem.quantity
    const unitPrice = itemData.unit_price ?? currentItem.unit_price
    const vatRate = itemData.vat_rate ?? currentItem.vat_rate ?? 10

    const { amount, vat_amount, total_amount } = calculateItemAmounts(quantity, unitPrice, vatRate)

    const updateData: Record<string, any> = {
      ...itemData,
      quantity,
      unit_price: unitPrice,
      vat_rate: vatRate,
      amount,
      vat_amount,
      total_amount,
      updated_at: new Date().toISOString(),
    }

    // Xóa các field không nên update trực tiếp
    delete updateData.sort_order

    const { data, error } = await supabase
      .from('purchase_order_items')
      .update(updateData)
      .eq('id', itemId)
      .select(PO_ITEM_SELECT)
      .single()

    if (error) {
      console.error('❌ [poService.updateItem] Error:', error)
      throw error
    }

    // Cập nhật tổng đơn hàng
    await this.recalculateOrderTotals(currentItem.order_id)

    console.log('✅ [poService.updateItem] Updated:', itemId)
    return data as PurchaseOrderItem
  },

  /**
   * Xóa item khỏi đơn hàng
   */
  async removeItem(itemId: string): Promise<void> {
    console.log('🗑️ [poService.removeItem] Item:', itemId)

    // Lấy order_id trước khi xóa
    const { data: item, error: fetchError } = await supabase
      .from('purchase_order_items')
      .select('order_id')
      .eq('id', itemId)
      .single()

    if (fetchError || !item) {
      throw new Error('Không tìm thấy chi tiết đơn hàng')
    }

    // Kiểm tra PO status
    const po = await this.getById(item.order_id)
    if (!po || po.status !== 'draft') {
      throw new Error('Không thể xóa chi tiết khi đơn hàng không ở trạng thái Nháp')
    }

    const { error } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      console.error('❌ [poService.removeItem] Error:', error)
      throw error
    }

    // Cập nhật tổng
    await this.recalculateOrderTotals(item.order_id)

    console.log('✅ [poService.removeItem] Removed:', itemId)
  },

  /**
   * Xóa tất cả items của đơn hàng
   */
  async removeAllItems(orderId: string): Promise<void> {
    console.log('🗑️ [poService.removeAllItems] Order:', orderId)

    const { error } = await supabase
      .from('purchase_order_items')
      .delete()
      .eq('order_id', orderId)

    if (error) {
      console.error('❌ [poService.removeAllItems] Error:', error)
      throw error
    }

    await this.recalculateOrderTotals(orderId)
    console.log('✅ [poService.removeAllItems] Done')
  },

  /**
   * Cập nhật sort_order cho items (drag-drop reorder)
   */
  async reorderItems(
    orderId: string,
    itemOrders: { id: string; sort_order: number }[]
  ): Promise<void> {
    console.log('🔄 [poService.reorderItems] Order:', orderId)

    const promises = itemOrders.map(({ id, sort_order }) =>
      supabase
        .from('purchase_order_items')
        .update({ sort_order })
        .eq('id', id)
    )

    await Promise.all(promises)
    console.log('✅ [poService.reorderItems] Done')
  },

  // ==========================================================================
  // CALCULATIONS
  // ==========================================================================

  /**
   * Tính lại tổng đơn hàng từ items
   */
  async recalculateOrderTotals(orderId: string): Promise<void> {
    console.log('🧮 [poService.recalculateOrderTotals] Order:', orderId)

    const items = await this.getItems(orderId)
    const totals = calculateOrderTotals(items)

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        total_amount: totals.total_amount,
        vat_amount: totals.vat_amount,
        grand_total: totals.grand_total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      console.error('❌ [poService.recalculateOrderTotals] Error:', error)
      // Không throw, chỉ log error
    }

    console.log('✅ [poService.recalculateOrderTotals] Totals:', totals)
  },

  // ==========================================================================
  // CODE GENERATION
  // ==========================================================================

  /**
   * Tạo mã đơn hàng tự động: DH-YYYY-NNNN
   */
  async generateOrderCode(): Promise<string> {
    const year = new Date().getFullYear()
    const prefix = `DH-${year}-`

    const { data, error } = await supabase
      .from('purchase_orders')
      .select('order_code')
      .ilike('order_code', `${prefix}%`)
      .order('order_code', { ascending: false })
      .limit(1)

    if (error) {
      console.error('❌ [poService.generateOrderCode] Error:', error)
      throw error
    }

    let nextNum = 1
    if (data && data.length > 0 && data[0].order_code) {
      const lastCode = data[0].order_code
      const numStr = lastCode.replace(prefix, '')
      const num = parseInt(numStr, 10)
      if (!isNaN(num)) {
        nextNum = num + 1
      }
    }

    const newCode = `${prefix}${nextNum.toString().padStart(4, '0')}`
    console.log('🔢 [poService.generateOrderCode] Generated:', newCode)
    return newCode
  },

  // ==========================================================================
  // HISTORY
  // ==========================================================================

  /**
   * Thêm lịch sử đơn hàng
   */
  async addHistory(
    orderId: string,
    action: string,
    performedBy: string,
    details?: {
      description?: string
      old_value?: any
      new_value?: any
      details?: any
    }
  ): Promise<void> {
    console.log('📝 [poService.addHistory] Order:', orderId, 'Action:', action)

    const { error } = await supabase
      .from('purchase_order_history')
      .insert({
        order_id: orderId,
        action,
        description: details?.description || null,
        old_value: details?.old_value || null,
        new_value: details?.new_value || null,
        details: details?.details || null,
        performed_by: performedBy,
        performed_at: new Date().toISOString(),
      })

    if (error) {
      console.error('❌ [poService.addHistory] Error:', error)
      // Không throw, chỉ log - history không critical
    }
  },

  /**
   * Lấy lịch sử đơn hàng
   */
  async getHistory(orderId: string): Promise<PurchaseOrderHistory[]> {
    console.log('📜 [poService.getHistory] Order:', orderId)

    const { data, error } = await supabase
      .from('purchase_order_history')
      .select(PO_HISTORY_SELECT)
      .eq('order_id', orderId)
      .order('performed_at', { ascending: false })

    if (error) {
      console.error('❌ [poService.getHistory] Error:', error)
      throw error
    }

    return (data || []) as PurchaseOrderHistory[]
  },

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Lấy thống kê đơn hàng (cho dashboard)
   */
  async getStats(): Promise<POStats> {
    console.log('📊 [poService.getStats]')

    const { data, error } = await supabase
      .from('purchase_orders')
      .select('status, grand_total, expected_delivery_date')

    if (error) {
      console.error('❌ [poService.getStats] Error:', error)
      throw error
    }

    const today = new Date().toISOString().split('T')[0]
    const orders = data || []

    const stats: POStats = {
      total_orders: orders.length,
      total_amount: orders.reduce((sum, o) => sum + (o.grand_total || 0), 0),
      draft_count: orders.filter(o => o.status === 'draft').length,
      confirmed_count: orders.filter(o => o.status === 'confirmed').length,
      partial_count: orders.filter(o => o.status === 'partial').length,
      completed_count: orders.filter(o => o.status === 'completed').length,
      cancelled_count: orders.filter(o => o.status === 'cancelled').length,
      overdue_count: orders.filter(o =>
        o.expected_delivery_date &&
        o.expected_delivery_date < today &&
        !['completed', 'cancelled'].includes(o.status)
      ).length,
    }

    console.log('✅ [poService.getStats] Result:', stats)
    return stats
  },

  /**
   * Đếm đơn hàng theo từng trạng thái
   */
  async getStatusCounts(filter?: Partial<POFilter>): Promise<Record<string, number>> {
    let query = supabase
      .from('purchase_orders')
      .select('status')

    if (filter?.department_id) {
      query = query.eq('department_id', filter.department_id)
    }
    if (filter?.created_by) {
      query = query.eq('created_by', filter.created_by)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [poService.getStatusCounts] Error:', error)
      throw error
    }

    const counts: Record<string, number> = {
      all: data?.length || 0,
      draft: 0,
      confirmed: 0,
      partial: 0,
      completed: 0,
      cancelled: 0,
    }

    data?.forEach((item: any) => {
      if (counts[item.status] !== undefined) {
        counts[item.status]++
      }
    })

    return counts
  },

  // ==========================================================================
  // SEARCH & LOOKUP
  // ==========================================================================

  /**
   * Tìm đơn hàng có chứa NCC cụ thể
   */
  async getOrdersBySupplier(supplierId: string): Promise<PurchaseOrder[]> {
    console.log('🔍 [poService.getOrdersBySupplier] Supplier:', supplierId)

    // Tìm order_ids từ items
    const { data: itemData, error: itemError } = await supabase
      .from('purchase_order_items')
      .select('order_id')
      .eq('supplier_id', supplierId)

    if (itemError) throw itemError

    const orderIds = [...new Set((itemData || []).map(i => i.order_id))]
    if (orderIds.length === 0) return []

    const { data, error } = await supabase
      .from('purchase_orders')
      .select(PO_SELECT)
      .in('id', orderIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as PurchaseOrder[]
  },

  /**
   * Lấy đơn hàng gần đây
   */
  async getRecent(limit = 5): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(PO_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return (data || []) as PurchaseOrder[]
  },

  /**
   * Lấy đơn hàng đã xác nhận (chờ giao hàng)
   */
  async getConfirmedOrders(): Promise<PurchaseOrder[]> {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select(PO_SELECT)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data || []) as PurchaseOrder[]
  },

  // ==========================================================================
  // PHASE P5: INVOICE & PAYMENT QUERIES
  // ==========================================================================

  /**
   * Lấy tổng hợp hóa đơn + thanh toán cho 1 đơn hàng
   * Dùng cho OrderInvoiceTab header cards
   */
  async getOrderInvoiceSummary(orderId: string): Promise<OrderInvoiceSummary> {
    console.log('📊 [poService.getOrderInvoiceSummary] Order:', orderId)

    // 1. Lấy thông tin đơn hàng
    const { data: order, error: orderError } = await supabase
      .from('purchase_orders')
      .select('id, order_code, grand_total, invoice_progress, payment_progress')
      .eq('id', orderId)
      .single()

    if (orderError) throw orderError

    // 2. Lấy tổng hợp hóa đơn
    const { data: invoices, error: invError } = await supabase
      .from('supplier_invoices')
      .select('id, total_amount, paid_amount, remaining_amount, status, due_date')
      .eq('order_id', orderId)
      .neq('status', 'cancelled')

    if (invError) throw invError

    const today = new Date().toISOString().split('T')[0]
    const invoiceList = invoices || []

    const totalInvoiced = invoiceList.reduce((sum, inv) => sum + (inv.total_amount || 0), 0)
    const totalPaid = invoiceList.reduce((sum, inv) => sum + (inv.paid_amount || 0), 0)
    const totalRemaining = invoiceList.reduce((sum, inv) => sum + (inv.remaining_amount || 0), 0)
    const overdueInvoices = invoiceList.filter(
      inv => inv.due_date && inv.due_date < today && inv.status !== 'paid'
    )
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + (inv.remaining_amount || 0), 0)

    return {
      order_id: order.id,
      order_code: order.order_code,
      grand_total: order.grand_total || 0,
      invoice_count: invoiceList.length,
      total_invoiced: totalInvoiced,
      invoice_progress: order.grand_total > 0
        ? Math.round((totalInvoiced / order.grand_total) * 100)
        : 0,
      total_paid: totalPaid,
      total_remaining: totalRemaining,
      payment_progress: totalInvoiced > 0
        ? Math.round((totalPaid / totalInvoiced) * 100)
        : 0,
      overdue_count: overdueInvoices.length,
      overdue_amount: overdueAmount,
    }
  },

  /**
   * Lấy chi tiết hóa đơn + payments theo NCC cho 1 đơn hàng
   * Dùng cho OrderInvoiceTab main content
   */
  async getOrderInvoiceBreakdown(orderId: string): Promise<OrderSupplierInvoiceBreakdown[]> {
    console.log('📊 [poService.getOrderInvoiceBreakdown] Order:', orderId)

    // 1. Lấy items nhóm theo NCC
    const { data: items, error: itemsError } = await supabase
      .from('purchase_order_items')
      .select(`
        supplier_id,
        total_amount,
        supplier:suppliers!purchase_order_items_supplier_id_fkey(
          id, code, name
        )
      `)
      .eq('order_id', orderId)

    if (itemsError) throw itemsError

    // Group items by supplier
    const supplierMap = new Map<string, {
      supplier_id: string
      supplier_code: string
      supplier_name: string
      order_subtotal: number
      order_item_count: number
    }>()

    for (const item of (items || [])) {
      const sid = item.supplier_id
      const supplier = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier
      if (!supplierMap.has(sid)) {
        supplierMap.set(sid, {
          supplier_id: sid,
          supplier_code: supplier?.code || '',
          supplier_name: supplier?.name || '',
          order_subtotal: 0,
          order_item_count: 0,
        })
      }
      const entry = supplierMap.get(sid)!
      entry.order_subtotal += item.total_amount || 0
      entry.order_item_count += 1
    }

    // 2. Lấy hóa đơn theo đơn hàng
    const { data: invoices, error: invError } = await supabase
      .from('supplier_invoices')
      .select(`
        id, invoice_code, invoice_number, invoice_date, due_date,
        total_amount, paid_amount, remaining_amount, status,
        image_urls, notes, created_by, created_at, supplier_id,
        creator:employees!supplier_invoices_created_by_fkey(full_name)
      `)
      .eq('order_id', orderId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })

    if (invError) throw invError

    // 3. Lấy payments cho tất cả invoices
    const invoiceIds = (invoices || []).map(inv => inv.id)
    const paymentsMap = new Map<string, InvoicePaymentDetail[]>()

    if (invoiceIds.length > 0) {
      const { data: payments, error: payError } = await supabase
        .from('invoice_payments')
        .select(`
          id, invoice_id, payment_date, amount, payment_method,
          reference_number, bank_name, notes, created_at,
          creator:employees!invoice_payments_created_by_fkey(full_name)
        `)
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false })

      if (payError) throw payError

      for (const p of (payments || [])) {
        const creator = Array.isArray(p.creator) ? p.creator[0] : p.creator
        const detail: InvoicePaymentDetail = {
          id: p.id,
          payment_date: p.payment_date,
          amount: p.amount,
          payment_method: p.payment_method,
          reference_number: p.reference_number,
          bank_name: p.bank_name,
          notes: p.notes,
          created_by_name: (creator as any)?.full_name || null,
          created_at: p.created_at,
        }
        if (!paymentsMap.has(p.invoice_id)) {
          paymentsMap.set(p.invoice_id, [])
        }
        paymentsMap.get(p.invoice_id)!.push(detail)
      }
    }

    // 4. Build breakdown
    const today = new Date().toISOString().split('T')[0]
    const result: OrderSupplierInvoiceBreakdown[] = []

    for (const [supplierId, supplierInfo] of supplierMap) {
      const supplierInvoices = (invoices || [])
        .filter(inv => inv.supplier_id === supplierId)
        .map(inv => {
          const creator = Array.isArray(inv.creator) ? inv.creator[0] : inv.creator
          const isOverdue = !!(inv.due_date && inv.due_date < today && inv.status !== 'paid')
          const daysOverdue = isOverdue && inv.due_date
            ? Math.floor((new Date().getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
            : 0

          return {
            id: inv.id,
            invoice_code: inv.invoice_code,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            due_date: inv.due_date,
            total_amount: inv.total_amount,
            paid_amount: inv.paid_amount,
            remaining_amount: inv.remaining_amount,
            status: inv.status,
            is_overdue: isOverdue,
            days_overdue: daysOverdue,
            image_urls: inv.image_urls,
            notes: inv.notes,
            created_by_name: (creator as any)?.full_name || null,
            created_at: inv.created_at,
            payments: paymentsMap.get(inv.id) || [],
          } as OrderInvoiceDetail
        })

      const totalInvoiced = supplierInvoices.reduce((s, i) => s + i.total_amount, 0)
      const totalPaid = supplierInvoices.reduce((s, i) => s + i.paid_amount, 0)

      result.push({
        ...supplierInfo,
        invoices: supplierInvoices,
        total_invoiced: totalInvoiced,
        invoice_progress: supplierInfo.order_subtotal > 0
          ? Math.round((totalInvoiced / supplierInfo.order_subtotal) * 100)
          : 0,
        total_paid: totalPaid,
        payment_progress: totalInvoiced > 0
          ? Math.round((totalPaid / totalInvoiced) * 100)
          : 0,
        remaining: totalInvoiced - totalPaid,
      })
    }

    // Sort: NCC có debt trước
    result.sort((a, b) => b.remaining - a.remaining)
    return result
  },

  /**
   * Lấy progress info cho danh sách đơn hàng (batch)
   * Dùng cho POListPage progress column
   */
  async getOrdersProgressBatch(orderIds: string[]): Promise<Map<string, OrderProgressInfo>> {
    console.log('📊 [poService.getOrdersProgressBatch] Count:', orderIds.length)

    if (orderIds.length === 0) return new Map()

    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, invoice_progress, payment_progress')
      .in('id', orderIds)

    if (error) throw error

    // Count invoices per order
    const { data: invoiceCounts, error: invErr } = await supabase
      .from('supplier_invoices')
      .select('order_id, id, status, due_date')
      .in('order_id', orderIds)
      .neq('status', 'cancelled')

    if (invErr) throw invErr

    const today = new Date().toISOString().split('T')[0]
    const invoiceMap = new Map<string, { count: number; overdue: number }>()
    for (const inv of (invoiceCounts || [])) {
      if (!invoiceMap.has(inv.order_id)) {
        invoiceMap.set(inv.order_id, { count: 0, overdue: 0 })
      }
      const entry = invoiceMap.get(inv.order_id)!
      entry.count += 1
      if (inv.due_date && inv.due_date < today && inv.status !== 'paid') {
        entry.overdue += 1
      }
    }

    const result = new Map<string, OrderProgressInfo>()
    for (const order of (data || [])) {
      const invInfo = invoiceMap.get(order.id) || { count: 0, overdue: 0 }
      result.set(order.id, {
        order_id: order.id,
        invoice_progress: order.invoice_progress || 0,
        payment_progress: order.payment_progress || 0,
        invoice_count: invInfo.count,
        overdue_count: invInfo.overdue,
      })
    }

    return result
  },

  /**
   * Lấy danh sách NCC trong đơn hàng (cho dropdown AddInvoiceModal)
   */
  async getOrderSuppliers(orderId: string): Promise<{
    id: string
    code: string
    name: string
    item_count: number
    subtotal: number
  }[]> {
    console.log('📊 [poService.getOrderSuppliers] Order:', orderId)

    const { data, error } = await supabase
      .from('purchase_order_items')
      .select(`
        supplier_id,
        total_amount,
        supplier:suppliers!purchase_order_items_supplier_id_fkey(id, code, name)
      `)
      .eq('order_id', orderId)

    if (error) throw error

    const map = new Map<string, {
      id: string
      code: string
      name: string
      item_count: number
      subtotal: number
    }>()

    for (const item of (data || [])) {
      const supplier = Array.isArray(item.supplier) ? item.supplier[0] : item.supplier
      const sid = item.supplier_id
      if (!map.has(sid)) {
        map.set(sid, {
          id: sid,
          code: supplier?.code || '',
          name: supplier?.name || '',
          item_count: 0,
          subtotal: 0,
        })
      }
      const entry = map.get(sid)!
      entry.item_count += 1
      entry.subtotal += item.total_amount || 0
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  },
}

export default purchaseOrderService