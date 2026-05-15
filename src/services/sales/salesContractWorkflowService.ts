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
import { SALES_CONFIG } from '../../config/sales.config'
import { createNotification } from '../notificationService'
import {
  salesContractEmailService,
  type ContractEmailContext,
} from './salesContractEmailService'

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

  /** Trung/Huy bấm "Xác nhận đã duyệt" — confirm thông tin OK, sẵn sàng in ký.
   *  Không đổi status. UI dùng để hiện section upload sau khi confirm. */
  signer_confirmed_at?: string | null
  signer_confirmed_by?: string | null

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

// Re-export từ SALES_CONFIG để giữ backward-compat các caller cũ.
// Source of truth duy nhất: src/config/sales.config.ts (sync với SQL migrations).
export const REVIEWER_EMAIL = SALES_CONFIG.DEFAULT_REVIEWER_EMAIL
export const ALLOWED_REVIEWER_EMAILS = SALES_CONFIG.REVIEWER_EMAILS
export const ALLOWED_SIGNER_EMAILS = SALES_CONFIG.SIGNER_EMAILS

export function isAllowedReviewer(email?: string | null): boolean {
  if (!email) return false
  return ALLOWED_REVIEWER_EMAILS.includes(email.toLowerCase())
}

export function isAllowedSigner(email?: string | null): boolean {
  if (!email) return false
  return ALLOWED_SIGNER_EMAILS.includes(email.toLowerCase())
}

const SIGNED_BUCKET = SALES_CONFIG.CONTRACT_BUCKET
const SIGNED_URL_TTL_SEC = SALES_CONFIG.SIGNED_URL_TTL_SEC

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

/** Log workflow event vào sales_contract_access_log (audit trail).
 *  Fire-and-forget — không block workflow nếu log fail. */
async function _logWorkflowEvent(params: {
  salesOrderId: string
  contractId: string
  action: 'submit' | 'resubmit' | 'approve' | 'reject' | 'signer_confirm' | 'send_back' | 'sign' | 'archive'
  userId: string | null
  notes?: string
}): Promise<void> {
  try {
    // Lấy user info (email + name) từ employees
    let user_email: string | null = null
    let user_name: string | null = null
    if (params.userId) {
      const { data } = await supabase
        .from('employees')
        .select('email, full_name')
        .eq('id', params.userId)
        .maybeSingle()
      user_email = data?.email || null
      user_name = data?.full_name || null
    }
    await supabase.from('sales_contract_access_log').insert({
      sales_order_id: params.salesOrderId,
      document_id: null,           // workflow event không gắn doc cụ thể
      action: params.action,
      user_id: params.userId,
      user_email,
      user_name,
      user_role: null,
      file_name: null,
      file_path: null,
      file_size: null,
      notes: params.notes || `Contract ID: ${params.contractId}`,
    })
  } catch (e) {
    console.error('[workflow] logEvent fail:', e)
  }
}

/** Build email context từ contract row + sender name. Fire-and-forget. */
async function _buildEmailContext(
  row: SalesOrderContract,
  senderId: string | null,
): Promise<ContractEmailContext> {
  let senderName = 'Hệ thống'
  if (senderId) {
    const { data } = await supabase
      .from('employees')
      .select('full_name')
      .eq('id', senderId)
      .maybeSingle()
    senderName = data?.full_name || 'Hệ thống'
  }
  const fd = row.form_data || {}
  return {
    contract_no: fd.contract_no || row.sales_order_id.slice(0, 8),
    revision_no: row.revision_no,
    buyer_name: fd.buyer_name,
    grade: fd.grade,
    quantity: fd.quantity,
    unit_price: fd.unit_price,
    amount: fd.amount,
    incoterm: fd.incoterm,
    sender_name: senderName,
    sales_order_id: row.sales_order_id,
  }
}

/** Build bank_summary string từ form_data (cho email approve) */
function _bankSummary(fd: Partial<ContractFormData>): string | undefined {
  if (!fd.bank_account_no) return undefined
  return `${fd.bank_account_name} — TK: ${fd.bank_account_no}<br>${fd.bank_full_name}<br>SWIFT: ${fd.bank_swift}`
}

/** Helper notify — fire-and-forget (không block workflow nếu noti fail). */
function _notifyContractEvent(params: {
  recipientIds: (string | null | undefined)[]
  senderId: string | null
  salesOrderId: string
  contractNo: string
  revisionNo: number
  title: string
  message: string
  priority?: 'normal' | 'high' | 'urgent'
  reference_url?: string
}) {
  const recipients = (params.recipientIds || []).filter(
    (id): id is string => !!id && id !== params.senderId,  // không tự ping mình
  )
  if (recipients.length === 0) return
  const refUrl = params.reference_url || `/sales/orders/${params.salesOrderId}?tab=contract`
  void Promise.all(
    recipients.map((recipientId) =>
      createNotification({
        recipient_id: recipientId,
        sender_id: params.senderId || undefined,
        module: 'system',
        notification_type: 'system_announcement',
        title: params.title,
        message: params.message,
        reference_id: params.salesOrderId,
        reference_type: 'sales_order_contract',
        reference_url: refUrl,
        priority: params.priority || 'normal',
        metadata: {
          contract_no: params.contractNo,
          revision_no: params.revisionNo,
        },
      }),
    ),
  ).catch((e) => console.error('Contract workflow notification failed:', e))
}

// ----------------------------------------------------------------------------
// Service
// ----------------------------------------------------------------------------

export const salesContractWorkflowService = {
  REVIEWER_EMAIL,
  ALLOWED_REVIEWER_EMAILS,
  ALLOWED_SIGNER_EMAILS,
  isAllowedReviewer,
  isAllowedSigner,
  getCurrentEmployeeId,
  getEmployeeIdByEmail,

  /** Check số HĐ đã tồn tại chưa (bỏ qua sales_order_id hiện tại nếu đang edit).
   *  Trả về true nếu trùng → caller hiển thị error. */
  async isContractNoTaken(
    contractNo: string,
    excludeSalesOrderId?: string,
  ): Promise<boolean> {
    if (!contractNo || !contractNo.trim()) return false
    let query = supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .eq('contract_no', contractNo.trim())
    if (excludeSalesOrderId) {
      query = query.neq('id', excludeSalesOrderId)
    }
    const { count, error } = await query
    if (error) {
      console.error('isContractNoTaken error:', error)
      return false
    }
    return (count || 0) > 0
  },

  /** Sale tạo HĐ draft + submit thẳng cho Phú LV review.
   *  Notify reviewer (cả Phú LV mặc định + Minh LD nếu có queue chung). */
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
    const row = data as SalesOrderContract

    // ─── B. Notify cả 2 reviewer (Phú LV + Minh LD) — ai vào queue trước thì duyệt ───
    const reviewerIds = await Promise.all(
      ALLOWED_REVIEWER_EMAILS.map((email) => getEmployeeIdByEmail(email)),
    )
    const contractNo = formData.contract_no || salesOrderId.slice(0, 8)
    const isResubmit = row.revision_no > 1
    _notifyContractEvent({
      recipientIds: reviewerIds,
      senderId: createdBy,
      salesOrderId,
      contractNo,
      revisionNo: row.revision_no,
      title: isResubmit
        ? `🔄 Sale trình LẠI HĐ ${contractNo} rev #${row.revision_no} — cần kiểm tra`
        : `📤 Sale trình HĐ ${contractNo} — cần kiểm tra + nhập bank`,
      message: isResubmit
        ? `Sale đã sửa + trình revision mới. Vào queue review để duyệt.`
        : `HĐ mới chờ bạn nhập bank info + duyệt trình Trung/Huy ký.`,
      priority: 'normal',
      reference_url: '/sales/contracts/review',
    })

    // ─── B. Email cho reviewers (Phú LV + Minh LD) ───
    void _buildEmailContext(row, createdBy).then((ctx) =>
      salesContractEmailService.notifySubmitted({
        reviewerEmails: ALLOWED_REVIEWER_EMAILS,
        ctx,
        isResubmit,
      }),
    ).catch((e) => console.error('Email submit fail:', e))

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId,
      contractId: row.id,
      action: isResubmit ? 'resubmit' : 'submit',
      userId: createdBy,
      notes: `${isResubmit ? 'Resubmit' : 'Submit'} HĐ ${contractNo} rev #${row.revision_no}`,
    })

    return row
  },

  /** List HĐ status='approved' chờ Trung/Huy ký. */
  async listForSigning(): Promise<SalesOrderContract[]> {
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .select(
        `*,
         sales_order:sales_orders!sales_order_contracts_sales_order_id_fkey(
           id, contract_no, customer_id, grade, quantity_tons, unit_price, status
         ),
         created_by_employee:employees!sales_order_contracts_created_by_fkey(id, full_name, email),
         reviewer_employee:employees!sales_order_contracts_reviewer_id_fkey(id, full_name, email)`,
      )
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
    if (error) throw error
    return (data as unknown as SalesOrderContract[]) || []
  },

  /** Upload PDF đã ký + đóng dấu lên Supabase Storage.
   *  Trả về storage path (lưu vào signed_pdf_url). */
  async uploadSignedPdf(
    contractId: string,
    revisionNo: number,
    file: File,
  ): Promise<string> {
    const ext = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'pdf'
    const path = `workflow-signed/${contractId}_rev${revisionNo}_${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from(SIGNED_BUCKET)
      .upload(path, file, {
        contentType: 'application/pdf',
        upsert: false,
      })
    if (error) throw error
    return path
  },

  /** Tạo signed URL ngắn hạn để mở/tải PDF đã ký. */
  async getSignedPdfUrl(path: string): Promise<string | null> {
    if (!path) return null
    // Nếu path đã là full URL (legacy) → return luôn
    if (path.startsWith('http')) return path
    const { data, error } = await supabase.storage
      .from(SIGNED_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SEC)
    if (error) {
      console.error('getSignedPdfUrl error:', error)
      return null
    }
    return data?.signedUrl || null
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

  /** Phú LV duyệt: update form_data (đã chèn bank info) + status='approved'.
   *  Notify cả Sale (báo HĐ đã duyệt) + Trung/Huy (chờ ký). */
  async approve(
    id: string,
    updatedFormData?: Partial<ContractFormData>,
    reviewNotes?: string,
  ): Promise<SalesOrderContract> {
    const senderId = await getCurrentEmployeeId()
    const updates: Record<string, unknown> = {
      status: 'approved',
      reviewed_at: new Date().toISOString(),
    }
    // Phú LV cũng là reviewer được record — set reviewer_id nếu chưa có
    if (senderId) updates.reviewer_id = senderId
    if (updatedFormData) updates.form_data = updatedFormData
    if (reviewNotes && reviewNotes.trim()) updates.review_notes = reviewNotes.trim()

    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const row = data as SalesOrderContract

    // ─── D. Notify Trung/Huy (signers) — họ chờ ký ───
    const signerIds = await Promise.all(
      ALLOWED_SIGNER_EMAILS.map((email) => getEmployeeIdByEmail(email)),
    )
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)
    _notifyContractEvent({
      recipientIds: signerIds,
      senderId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `✍️ HĐ ${contractNo} chờ ký — Phú LV đã duyệt`,
      message: 'Vào queue Ký HĐ để in + ký + đóng dấu + upload PDF.',
      priority: 'high',
      reference_url: '/sales/contracts/sign',
    })

    // ─── D bonus. Notify Sale (báo đã được duyệt) ───
    _notifyContractEvent({
      recipientIds: [row.created_by],
      senderId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `✅ HĐ ${contractNo} đã được Phú LV duyệt`,
      message: 'Bank info đã chốt. Đang chờ Trung/Huy ký + đóng dấu.',
      priority: 'normal',
    })

    // ─── D. Email cho Trung/Huy (signers) + Sale (info) ───
    void _buildEmailContext(row, senderId).then((ctx) =>
      salesContractEmailService.notifyApproved({
        signerEmails: ALLOWED_SIGNER_EMAILS,
        saleEmployeeId: row.created_by,
        ctx: { ...ctx, bank_summary: _bankSummary(row.form_data || {}) },
      }),
    ).catch((e) => console.error('Email approve fail:', e))

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'approve',
      userId: senderId,
      notes: `Approve HĐ ${contractNo} rev #${row.revision_no}${reviewNotes ? ` — ${reviewNotes}` : ''}`,
    })

    return row
  },

  /** Phú LV trả lại: status='rejected', cần lý do. Notify Sale (created_by). */
  async reject(id: string, rejectedReason: string): Promise<SalesOrderContract> {
    if (!rejectedReason || !rejectedReason.trim()) {
      throw new Error('Cần nhập lý do trả lại')
    }
    const senderId = await getCurrentEmployeeId()
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
    const row = data as SalesOrderContract

    // ─── A. Notify Sale (created_by) — họ phải biết để sửa + trình lại ───
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)
    const reasonExcerpt = rejectedReason.trim().slice(0, 200)
    _notifyContractEvent({
      recipientIds: [row.created_by],
      senderId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `❌ HĐ ${contractNo} bị Phú LV trả lại — cần sửa`,
      message: reasonExcerpt,
      priority: 'high',
      reference_url: `/sales/orders/${row.sales_order_id}?tab=contract`,
    })

    // ─── A. Email cho Sale với full lý do ───
    void _buildEmailContext(row, senderId).then((ctx) =>
      salesContractEmailService.notifyRejected({
        saleEmployeeId: row.created_by,
        ctx: { ...ctx, rejection_reason: rejectedReason.trim() },
      }),
    ).catch((e) => console.error('Email reject fail:', e))

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'reject',
      userId: senderId,
      notes: `Reject HĐ ${contractNo} rev #${row.revision_no} — ${rejectedReason.trim().slice(0, 300)}`,
    })

    return row
  },

  /** Trung/Huy bấm "Xác nhận đã duyệt" — confirm thông tin HĐ OK, sẵn sàng in ký.
   *  KHÔNG đổi status (vẫn 'approved'). Set signer_confirmed_at/by để UI hiện
   *  section upload "HĐ HA ký" và "HĐ FINAL ký 2 bên".
   *  Sau confirm: ai cũng có thể in HĐ ra ký + scan upload. */
  async confirmReadyToSign(id: string): Promise<SalesOrderContract> {
    const senderId = await getCurrentEmployeeId()
    if (!senderId) throw new Error('Không xác định được nhân viên hiện tại')
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update({
        signer_confirmed_at: new Date().toISOString(),
        signer_confirmed_by: senderId,
        // signer_id = current để identify ai confirm; sẽ overwrite khi markSigned
        signer_id: senderId,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const row = data as SalesOrderContract

    // Notify Sale + Phú LV (HĐ đã được Trung/Huy chốt, chờ in ký + KH ký lại)
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)
    _notifyContractEvent({
      recipientIds: [row.created_by, row.reviewer_id],
      senderId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `🖊 HĐ ${contractNo} đã được Trung/Huy xác nhận — sẵn sàng in ký`,
      message: 'Có thể in HĐ ra → ký + đóng dấu HA → upload bản scan vào folder "HĐ HA đã ký". Khi KH gửi lại bản ký 2 bên → upload vào "HĐ FINAL".',
      priority: 'normal',
    })

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'signer_confirm',
      userId: senderId,
      notes: `Signer xác nhận đã duyệt HĐ ${contractNo} rev #${row.revision_no} — sẵn sàng in ký`,
    })

    return row
  },

  /** Trung/Huy "Trả lại" về Phú LV nếu phát hiện sai (bank/giá/...).
   *  Status approved → reviewing (Phú LV xem lại). Reset reviewed_at + bank fields. */
  async sendBackToReview(id: string, reason: string): Promise<SalesOrderContract> {
    if (!reason || !reason.trim()) {
      throw new Error('Cần nhập lý do trả lại')
    }
    const senderId = await getCurrentEmployeeId()
    // Lấy form_data hiện tại để reset bank fields (Phú LV nhập lại)
    const { data: current } = await supabase
      .from('sales_order_contracts')
      .select('form_data, sales_order_id, revision_no, created_by, reviewer_id')
      .eq('id', id)
      .single()
    if (!current) throw new Error('Không tìm thấy HĐ')
    const resetFormData = {
      ...(current.form_data || {}),
      // KHÔNG reset bank fields hoàn toàn — giữ để Phú LV sửa, đỡ phải gõ lại
      // chỉ note vào review_notes
    }
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update({
        status: 'reviewing',
        form_data: resetFormData,
        review_notes: `[Trung/Huy trả lại ${new Date().toLocaleDateString('vi-VN')}] ${reason.trim()}`,
        reviewed_at: null,                  // reset để Phú LV review lại
        signer_confirmed_at: null,          // reset confirm flag
        signer_confirmed_by: null,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const row = data as SalesOrderContract

    // Notify Phú LV + Minh (queue review) — Trung/Huy trả lại
    const reviewerIds = await Promise.all(
      ALLOWED_REVIEWER_EMAILS.map((email) => getEmployeeIdByEmail(email)),
    )
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)
    _notifyContractEvent({
      recipientIds: reviewerIds,
      senderId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `🔁 Trung/Huy TRẢ LẠI HĐ ${contractNo} — review lại`,
      message: reason.trim().slice(0, 200),
      priority: 'high',
      reference_url: '/sales/contracts/review',
    })

    // Email cho Phú LV + Minh
    void _buildEmailContext(row, senderId).then((ctx) =>
      salesContractEmailService.notifySubmitted({
        reviewerEmails: ALLOWED_REVIEWER_EMAILS,
        ctx: { ...ctx, rejection_reason: reason.trim() },
        isResubmit: true,  // dùng template "đã sửa — trình lại" với note hint
      }),
    ).catch((e) => console.error('Email send-back fail:', e))

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'send_back',
      userId: senderId,
      notes: `Trung/Huy trả lại Phú LV — HĐ ${contractNo} rev #${row.revision_no} — ${reason.trim().slice(0, 300)}`,
    })

    return row
  },

  /** Trung/Huy đánh dấu đã ký + upload PDF đã ký.
   *  Notify Sale + Phú LV (HĐ pháp lý đã sẵn sàng gửi KH). */
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
    const row = data as SalesOrderContract

    // ─── E. Notify Sale + Phú LV (reviewer) — HĐ pháp lý sẵn sàng ───
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)
    _notifyContractEvent({
      recipientIds: [row.created_by, row.reviewer_id],
      senderId: signerId,
      salesOrderId: row.sales_order_id,
      contractNo,
      revisionNo: row.revision_no,
      title: `✍️ HĐ ${contractNo} đã được ký + đóng dấu`,
      message: 'HĐ pháp lý sẵn sàng. Sale có thể gửi bản FINAL cho khách.',
      priority: 'high',
    })

    // ─── E. Email cho Sale + Phú LV ───
    void _buildEmailContext(row, signerId).then(async (ctx) => {
      // Lookup signer name
      let signerName = 'Trung/Huy'
      if (signerId) {
        const { data } = await supabase
          .from('employees')
          .select('full_name')
          .eq('id', signerId)
          .maybeSingle()
        signerName = data?.full_name || signerName
      }
      return salesContractEmailService.notifySigned({
        saleEmployeeId: row.created_by,
        reviewerEmployeeId: row.reviewer_id,
        ctx: { ...ctx, signer_name: signerName },
      })
    }).catch((e) => console.error('Email signed fail:', e))

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'sign',
      userId: signerId,
      notes: `HĐ ${contractNo} rev #${row.revision_no} đã ký + đóng dấu — PDF: ${signedPdfUrl}`,
    })

    return row
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

  /** Lưu trữ HĐ đã ký (signed → archived). Admin only — RLS guard. */
  async archive(id: string): Promise<SalesOrderContract> {
    const senderId = await getCurrentEmployeeId()
    const { data, error } = await supabase
      .from('sales_order_contracts')
      .update({ status: 'archived' })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    const row = data as SalesOrderContract
    const contractNo = row.form_data?.contract_no || row.sales_order_id.slice(0, 8)

    // ─── Audit log ───
    void _logWorkflowEvent({
      salesOrderId: row.sales_order_id,
      contractId: row.id,
      action: 'archive',
      userId: senderId,
      notes: `Lưu trữ HĐ ${contractNo} rev #${row.revision_no}`,
    })

    return row
  },
}
