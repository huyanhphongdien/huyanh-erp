// ============================================================================
// SALES CONTRACT SERVICE — Upload + quản lý FILE HỢP ĐỒNG đơn hàng bán
// File: src/services/sales/salesContractService.ts
//
// Quy tắc:
//  - Sale upload lần đầu khi đơn chưa có HĐ
//  - Chỉ BGĐ (admin + Mr. Trung) + sale-uploader xem được file
//  - Không ai xóa được
//  - Chỉ admin (BGĐ) được upload lại (replace) — file cũ vẫn còn trong storage
//  - Log mọi action: upload / view / download / replace
//  - Storage path: orders/{orderId}/contracts/{timestamp}_{filename}
//  - Bucket "sales-contracts" PRIVATE — dùng signed URL ngắn hạn để xem/tải
// ============================================================================

import { supabase } from '../../lib/supabase'
import { isBOD, type SalesRole } from './salesPermissionService'
import type { SalesDocument } from './salesDocumentUploadService'

const BUCKET = 'sales-contracts'
const SIGNED_URL_TTL_SEC = 120 // 2 phút — đủ để mở/tải, không đủ để share rộng

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/** Ai được upload thêm file HĐ.
 *  - Admin/BGĐ: luôn được (cả lần đầu lẫn add more)
 *  - Sale: luôn được add (theo yêu cầu BGĐ — Sale up thêm tài liệu nhưng không
 *    được xóa). Limit max files do MAX_CONTRACT_FILES kiểm soát ở UI.
 *  - Tham số hasExisting giữ lại cho backward-compat, không còn dùng nữa. */
export function canUploadContract(
  _hasExisting: boolean,
  salesRole: SalesRole | null,
  user: any,
): boolean {
  if (!salesRole) return false
  if (salesRole === 'admin' || isBOD(user)) return true
  if (salesRole === 'sale') return true
  return false
}

/** Ai được REPLACE HĐ đã có */
export function canReplaceContract(
  salesRole: SalesRole | null,
  user: any,
): boolean {
  if (!salesRole) return false
  return salesRole === 'admin' || isBOD(user)
}

/** Ai được xem file HĐ */
export function canViewContract(
  doc: SalesDocument | null,
  user: any,
  salesRole: SalesRole | null,
): boolean {
  if (!doc || !doc.file_url) return false
  if (!salesRole) return false
  // BGĐ: xem mọi HĐ
  if (isBOD(user)) return true
  if (salesRole === 'admin') return true
  // Sale: chỉ xem HĐ do chính mình upload
  if (salesRole === 'sale' && doc.uploaded_by && user?.employee_id) {
    return doc.uploaded_by === user.employee_id
  }
  return false
}

/** Ai được xem lịch sử truy cập */
export function canViewAccessLog(user: any, salesRole: SalesRole | null): boolean {
  if (!salesRole) return false
  return salesRole === 'admin' || isBOD(user)
}

/** Ai được XÓA file HĐ (hard delete + remove storage object).
 *  Đồng bộ với migration sales_contract_files_multi_v4.sql (RLS DELETE policy). */
export function canDeleteContract(
  salesRole: SalesRole | null,
  user: any,
): boolean {
  if (!salesRole) return false
  // Admin role (Minh, Thúy, Huy) + BGĐ (Trung) — Sale + accounting + logistics KHÔNG được xóa
  return salesRole === 'admin' || isBOD(user)
}

// ============================================================================
// TYPES
// ============================================================================

export type ContractAction = 'upload' | 'view' | 'download' | 'replace' | 'delete'

export interface ContractAccessLogEntry {
  id: string
  sales_order_id: string
  document_id: string | null
  action: ContractAction
  user_id: string | null
  user_email: string | null
  user_name: string | null
  user_role: string | null
  file_name: string | null
  file_path: string | null
  file_size: number | null
  notes: string | null
  created_at: string
}

// ============================================================================
// SERVICE
// ============================================================================

export const salesContractService = {

  /** Lấy 1 record HĐ đầu tiên (legacy single-file mode).
   *  KHUYẾN NGHỊ: dùng getContracts() để hỗ trợ multi-file. */
  async getContract(orderId: string): Promise<SalesDocument | null> {
    const rows = await this.getContracts(orderId)
    return rows[0] || null
  },

  /** Lấy TẤT CẢ file HĐ của 1 đơn hàng (mới upload lên đầu). */
  async getContracts(orderId: string): Promise<SalesDocument[]> {
    const { data, error } = await supabase
      .from('sales_order_documents')
      .select('*')
      .eq('sales_order_id', orderId)
      .eq('doc_type', 'contract')
      .order('received_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
    if (error) {
      console.error('[salesContract] getContracts error:', error)
      return []
    }
    return (data || []) as SalesDocument[]
  },

  /** Xóa 1 file HĐ (hard delete row + storage object). Best-effort cho storage:
   *  nếu xóa storage fail (permission), vẫn xóa row + log. */
  async deleteContract(
    docId: string,
    user: any,
    salesRole: SalesRole | null,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!canDeleteContract(salesRole, user)) {
      return { ok: false, error: 'Không có quyền xóa file HĐ' }
    }
    try {
      // 1. Lấy doc để biết file_url + orderId
      const { data: doc, error: getErr } = await supabase
        .from('sales_order_documents')
        .select('*')
        .eq('id', docId)
        .maybeSingle()
      if (getErr || !doc) {
        return { ok: false, error: getErr?.message || 'Không tìm thấy file' }
      }

      // 2. Xóa file trong Storage (best-effort)
      if (doc.file_url) {
        const { error: rmErr } = await supabase.storage
          .from(BUCKET)
          .remove([doc.file_url])
        if (rmErr) {
          console.warn('[salesContract] storage remove failed (vẫn xóa row):', rmErr)
        }
      }

      // 3. Xóa row
      const { error: delErr } = await supabase
        .from('sales_order_documents')
        .delete()
        .eq('id', docId)
      if (delErr) {
        return { ok: false, error: delErr.message }
      }

      // 4. Log
      await this.logAccess({
        orderId: doc.sales_order_id,
        documentId: docId,
        action: 'delete',
        user,
        salesRole,
        fileName: doc.file_name,
        filePath: doc.file_url,
        fileSize: doc.file_size,
      })

      return { ok: true }
    } catch (e: any) {
      console.error('[salesContract] deleteContract error:', e)
      return { ok: false, error: e?.message || 'Lỗi xóa file' }
    }
  },

  /** Khởi tạo row contract nếu chưa có (gọi trước khi upload lần đầu) */
  async ensureContractRow(orderId: string): Promise<SalesDocument | null> {
    const existing = await this.getContract(orderId)
    if (existing) return existing
    const { data, error } = await supabase
      .from('sales_order_documents')
      .insert({
        sales_order_id: orderId,
        doc_type: 'contract',
        doc_name: 'Hợp đồng (Contract)',
        sort_order: 0,
        is_received: false,
      })
      .select('*')
      .single()
    if (error) {
      console.error('[salesContract] ensureContractRow error:', error)
      return null
    }
    return data
  },

  /**
   * Upload file HĐ.
   * - Lưu vào bucket private 'sales-contracts'
   * - Path: orders/{orderId}/contracts/{timestamp}_{filename}
   * - Hành vi:
   *   + `replaceDocId` được truyền → UPDATE row đó, action='replace'
   *   + Không truyền + chưa có row nào → INSERT row mới (lần đầu), action='upload'
   *   + Không truyền + đã có rows → INSERT thêm row mới (multi-file), action='upload'
   * - File cũ khi replace giữ nguyên trong storage (đã log) — không xóa
   */
  async uploadContract(
    orderId: string,
    file: File,
    user: any,
    salesRole: SalesRole | null,
    options: {
      replaceDocId?: string
      /** sub_type cho doc_type=contract:
       *  - 'sent_to_customer': drafts gửi KH duyệt (default)
       *  - 'final_signed': bản ký 2 bên (chỉ admin/BGĐ upload)
       *  - undefined: legacy/không chỉ định → 'sent_to_customer' */
      subType?: 'sent_to_customer' | 'final_signed'
    } = {},
  ): Promise<{ ok: boolean; doc?: SalesDocument; error?: string }> {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `orders/${orderId}/contracts/${Date.now()}_${safeName}`

      // 1. Upload lên storage
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        return { ok: false, error: upErr.message }
      }

      let dbDoc: SalesDocument | null = null
      let action: ContractAction = 'upload'

      if (options.replaceDocId) {
        // 2a. UPDATE row được chỉ định
        const { data: updated, error: dbErr } = await supabase
          .from('sales_order_documents')
          .update({
            file_url: path,
            file_name: file.name,
            file_size: file.size,
            is_received: true,
            received_at: new Date().toISOString(),
            uploaded_by: user?.employee_id || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', options.replaceDocId)
          .select('*')
          .single()
        if (dbErr) return { ok: false, error: dbErr.message }
        dbDoc = updated
        action = 'replace'
      } else {
        // 2b. INSERT row mới (lần đầu hoặc thêm file vào danh sách)
        const subType = options.subType || 'sent_to_customer'
        const docName = subType === 'final_signed'
          ? 'HĐ FINAL (ký + đóng dấu 2 bên)'
          : 'HĐ gửi KH'
        const { data: inserted, error: dbErr } = await supabase
          .from('sales_order_documents')
          .insert({
            sales_order_id: orderId,
            doc_type: 'contract',
            doc_sub_type: subType,
            doc_name: docName,
            sort_order: 0,
            file_url: path,
            file_name: file.name,
            file_size: file.size,
            is_received: true,
            received_at: new Date().toISOString(),
            uploaded_by: user?.employee_id || null,
          })
          .select('*')
          .single()
        if (dbErr) return { ok: false, error: dbErr.message }
        dbDoc = inserted
        action = 'upload'
      }

      // 3. Log
      await this.logAccess({
        orderId,
        documentId: dbDoc?.id || null,
        action,
        user,
        salesRole,
        fileName: file.name,
        filePath: path,
        fileSize: file.size,
      })

      return { ok: true, doc: dbDoc || undefined }
    } catch (e: any) {
      console.error('[salesContract] uploadContract error:', e)
      return { ok: false, error: e?.message || 'Lỗi upload' }
    }
  },

  /**
   * Tạo signed URL ngắn hạn để xem/tải file.
   * Đồng thời ghi log action (view hoặc download).
   * Trả về null nếu không có quyền hoặc lỗi.
   */
  async getSignedUrl(
    doc: SalesDocument,
    action: 'view' | 'download',
    user: any,
    salesRole: SalesRole | null,
  ): Promise<string | null> {
    if (!doc.file_url) return null
    if (!canViewContract(doc, user, salesRole)) return null

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(
        doc.file_url,
        SIGNED_URL_TTL_SEC,
        action === 'download' ? { download: doc.file_name || 'contract.pdf' } : undefined,
      )

    if (error || !data?.signedUrl) {
      console.error('[salesContract] getSignedUrl error:', error)
      return null
    }

    // Log
    await this.logAccess({
      orderId: doc.sales_order_id,
      documentId: doc.id,
      action,
      user,
      salesRole,
      fileName: doc.file_name,
      filePath: doc.file_url,
      fileSize: doc.file_size,
    })

    return data.signedUrl
  },

  /** Ghi log vào sales_contract_access_log */
  async logAccess(params: {
    orderId: string
    documentId: string | null
    action: ContractAction
    user: any
    salesRole: SalesRole | null
    fileName?: string | null
    filePath?: string | null
    fileSize?: number | null
    notes?: string | null
  }): Promise<void> {
    try {
      await supabase.from('sales_contract_access_log').insert({
        sales_order_id: params.orderId,
        document_id: params.documentId,
        action: params.action,
        user_id: params.user?.id || null,
        user_email: params.user?.email || null,
        user_name: params.user?.full_name || null,
        user_role: params.salesRole || null,
        file_name: params.fileName || null,
        file_path: params.filePath || null,
        file_size: params.fileSize || null,
        notes: params.notes || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
    } catch (e) {
      console.error('[salesContract] logAccess error:', e)
    }
  },

  /** Lấy lịch sử truy cập (BGĐ only — RLS đã guard) */
  async getAccessLog(orderId: string): Promise<ContractAccessLogEntry[]> {
    const { data, error } = await supabase
      .from('sales_contract_access_log')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[salesContract] getAccessLog error:', error)
      return []
    }
    return (data || []) as ContractAccessLogEntry[]
  },
}
