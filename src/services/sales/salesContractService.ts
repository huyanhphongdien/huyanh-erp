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

/** Ai được upload HĐ lần đầu / replace */
export function canUploadContract(
  hasExisting: boolean,
  salesRole: SalesRole | null,
  user: any,
): boolean {
  if (!salesRole) return false
  // Admin / BGĐ luôn được upload (cả lần đầu lẫn replace)
  if (salesRole === 'admin' || isBOD(user)) return true
  // Sale chỉ được upload LẦN ĐẦU (khi chưa có file)
  if (salesRole === 'sale' && !hasExisting) return true
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

// ============================================================================
// TYPES
// ============================================================================

export type ContractAction = 'upload' | 'view' | 'download' | 'replace'

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

  /** Lấy record hợp đồng của đơn hàng (nếu có) */
  async getContract(orderId: string): Promise<SalesDocument | null> {
    const { data, error } = await supabase
      .from('sales_order_documents')
      .select('*')
      .eq('sales_order_id', orderId)
      .eq('doc_type', 'contract')
      .maybeSingle()
    if (error) {
      console.error('[salesContract] getContract error:', error)
      return null
    }
    return data
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
   * - Update sales_order_documents.file_url = storage PATH (không phải public URL)
   * - Log action: upload | replace
   */
  async uploadContract(
    orderId: string,
    file: File,
    user: any,
    salesRole: SalesRole | null,
  ): Promise<{ ok: boolean; doc?: SalesDocument; error?: string }> {
    try {
      // Đảm bảo có row
      const existing = await this.ensureContractRow(orderId)
      if (!existing) return { ok: false, error: 'Không tạo được record hợp đồng' }

      const isReplace = !!existing.file_url
      const action: ContractAction = isReplace ? 'replace' : 'upload'

      // Sanitize filename — loại ký tự lạ
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `orders/${orderId}/contracts/${Date.now()}_${safeName}`

      // Upload — bucket private
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (upErr) {
        return { ok: false, error: upErr.message }
      }

      // Update DB — file_url lưu PATH (không phải public URL)
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
        .eq('id', existing.id)
        .select('*')
        .single()
      if (dbErr) {
        return { ok: false, error: dbErr.message }
      }

      // Log
      await this.logAccess({
        orderId,
        documentId: existing.id,
        action,
        user,
        salesRole,
        fileName: file.name,
        filePath: path,
        fileSize: file.size,
      })

      return { ok: true, doc: updated }
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
