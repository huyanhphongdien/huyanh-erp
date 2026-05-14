// ============================================================================
// SALES CONTRACT WORKFLOW SERVICE
// File: src/services/sales/salesContractWorkflowService.ts
//
// CRUD bảng sales_order_contracts (workflow ký HĐ bán):
//   drafting → reviewing → approved/rejected → signed → archived
//
// Workflow:
//   1. Sale tạo đơn → createDraftAndSubmit() — status='reviewing',
//      reviewer_id = phulv@huyanhrubber.com
//   2. Phú LV mở queue review → approve() / reject(reason).
//      Khi approve có thể update bank info trong form_data.
//   3. Trung/Huy upload PDF đã ký → markSigned()
//
// Khác với salesContractService.ts hiện có (upload file HĐ scan đã ký).
// Đây là workflow sinh HĐ tự động từ template + duyệt.
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { ContractFormData } from './contractGeneratorService'

export type ContractStatus =
  | 'drafting'
  | 'reviewing'
  | 'rejected'
  | 'approved'
  | 'signed'
  | 'archived'

export interface SalesOrderContract {
  id: string
  sales_order_id: string
  revision_no: number
  status: ContractStatus
  sc_file_url?: string | null
  pi_file_url?: string | null
  signed_pdf_url?: string | null
  form_data: Partial<ContractFormData>

  created_by?: string | null
  created_at: string

  submitted_at?: string | null

  reviewer_id?: string | null
  reviewed_at?: string | null
  review_notes?: string | null

  signer_id?: string | null
  signed_at?: string | null

  rejected_at?: string | null
  rejected_reason?: string | null

  updated_at: string

  // Joins (optional)
  sales_order?: {
    id: string
    contract_no?: string
    customer_id?: string
    grade?: string
    quantity_tons?: number
    unit_price?: number
    status?: string
  } | null
  created_by_employee?: { id: string; full_name?: string; email?: string } | null
  reviewer_employee?: { id: string; full_name?: string; email?: string } | null
  signer_employee?: { id: string; full_name?: string; email?: string } | null
}

/** Default reviewer khi Sale submit — Phú LV xử lý chính. */
export const REVIEWER_EMAIL = 'phulv@huyanhrubber.com'

/** Whitelist email được phép xem queue + duyệt/trả lại HĐ (đồng bộ với
 *  migration sales_contract_workflow_v2_reviewers.sql). */
export const ALLOWED_REVIEWER_EMAILS = [
  'phulv@huyanhrubber.com', // Phú LV — Kế toán, người mặc định
  'minhld@huyanhrubber.com', // Minh LD — Admin
]

export function isAllowedReviewer(email?: string | null): boolean {
  if (!email) return false
  return ALLOWED_REVIEWER_EMAILS.includes(email.toLowerCase())
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Lấy employee.id của user hiện tại (link qua user_id). */
export async function getCurrentEmployeeId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('getCurrentEmployeeId error:', error)
    return null
  }
  return data?.id || null
}

/** Lookup employee.id từ email (dùng để gán reviewer = Phú LV). */
export async function getEmployeeIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()
  if (error) {
    console.error(`getEmployeeIdByEmail(${email}) error:`, error)
    return null
  }
  return data?.id || null
}

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export const salesContractWorkflowService = {
  REVIEWER_EMAIL,
  ALLOWED_REVIEWER_EMAILS,
  isAllowedReviewer,
  getCurrentEmployeeId,
  getEmployeeIdByEmail,

  /** Sale tạo HĐ draft + submit thẳng cho Phú LV review. */
  async createDraftAndSubmit(
    salesOrderId: string,
    formData: Partial<ContractFormData>,
  ): Promise<SalesOrderContract> {
    const [createdBy, reviewerId] = await Promise.all([
      getCurrentEmployeeId(),
      getEmployeeIdByEmail(REVIEWER_EMAIL),
    ])
    if (!reviewerId) {
      throw new Error(
        `Không tìm thấy nhân viên ${REVIEWER_EMAIL} trong bảng employees. Liên hệ admin để gán user account.`,
      )
    }
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .insert({
        sales_order_id: salesOrderId,
        status: 'reviewing',
        form_data: formData,
        created_by: createdBy,
        submitted_at: new Date().toISOString(),
        reviewer_id: reviewerId,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderContract
  },

  /** List HĐ pending review.
   *  - Nếu user trong ALLOWED_REVIEWER_EMAILS → list TẤT CẢ status='reviewing'
   *    (cả 2 reviewer thấy chung 1 queue, ai vào trước duyệt trước).
   *  - Nếu khác → chỉ list HĐ assign trực tiếp cho reviewerId.
   *  Caller truyền `viewAll=true` để bypass filter (admin). */
  async listForReview(
    reviewerId?: string | null,
    viewAll = false,
  ): Promise<SalesOrderContract[]> {
    let query = supabase
      .from('sales_order_contracts')
      .select(
        `*,
         sales_order:sales_orders!sales_order_contracts_sales_order_id_fkey(
           id, contract_no, customer_id, grade, quantity_tons, unit_price, status
         ),
         created_by_employee:employees!sales_order_contracts_created_by_fkey(id, full_name, email),
         reviewer_employee:employees!sales_order_contracts_reviewer_id_fkey(id, full_name, email)`,
      )
      .eq('status', 'reviewing')
      .order('submitted_at', { ascending: false })

    if (!viewAll && reviewerId) {
      query = query.eq('reviewer_id', reviewerId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data as unknown as SalesOrderContract[]) || []
  },

  /** Phú LV duyệt: update form_data (đã chèn bank info) + status='approved'. */
  async approve(
    id: string,
    updatedFormData?: Partial<ContractFormData>,
    reviewNotes?: string,
  ): Promise<SalesOrderContract> {
    const updates: Record<string, unknown> = {
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }
    if (updatedFormData) updates.form_data = updatedFormData
    if (reviewNotes && reviewNotes.trim()) updates.review_notes = reviewNotes.trim()

    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderContract
  },

  /** Phú LV trả lại: status='rejected', cần lý do. */
  async reject(id: string, rejectedReason: string): Promise<SalesOrderContract> {
    if (!rejectedReason || !rejectedReason.trim()) {
      throw new Error('Cần nhập lý do trả lại')
    }
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update({
        status: 'rejected',
        rejected_reason: rejectedReason.trim(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderContract
  },

  /** Trung/Huy đánh dấu đã ký + upload PDF đã ký. */
  async markSigned(id: string, signedPdfUrl: string): Promise<SalesOrderContract> {
    const signerId = await getCurrentEmployeeId()
    if (!signerId) throw new Error('Không xác định được nhân viên hiện tại')
    if (!signedPdfUrl) throw new Error('Cần upload PDF đã ký trước')
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update({
        status: 'signed',
        signer_id: signerId,
        signed_pdf_url: signedPdfUrl,
        signed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderContract
  },

  async getById(id: string): Promise<SalesOrderContract | null> {
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .select(
        `*, sales_order:sales_orders!sales_order_contracts_sales_order_id_fkey(*)`,
      )
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('getById error:', error)
      return null
    }
    return data as SalesOrderContract | null
  },

  async listBySalesOrder(salesOrderId: string): Promise<SalesOrderContract[]> {
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .select('*')
      .eq('sales_order_id', salesOrderId)
      .order('revision_no', { ascending: false })
    if (error) throw error
    return (data as SalesOrderContract[]) || []
  },

  /** Sau khi reject, Sale sửa lại + submit revision mới (trigger DB auto +1). */
  async resubmitRevision(
    salesOrderId: string,
    formData: Partial<ContractFormData>,
  ): Promise<SalesOrderContract> {
    return this.createDraftAndSubmit(salesOrderId, formData)
  },
}
