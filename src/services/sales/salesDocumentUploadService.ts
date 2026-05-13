// ============================================================================
// SALES DOCUMENT UPLOAD SERVICE — Upload + quản lý chứng từ đơn hàng bán
// File: src/services/sales/salesDocumentUploadService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface SalesDocument {
  id: string
  sales_order_id: string
  doc_type: string
  doc_name: string
  file_url: string | null
  file_name: string | null
  file_size: number | null
  is_received: boolean
  received_at: string | null
  uploaded_by: string | null
  notes: string | null
  sort_order: number
  created_at: string
}

// Danh sách chứng từ tiêu chuẩn xuất khẩu cao su
// owner: role nào được upload/sửa chứng từ này (admin luôn được)
export const STANDARD_DOCUMENTS = [
  { doc_type: 'contract',          doc_name: 'Hợp đồng (Contract)',           sort_order: 0,  required: true,  owner: 'sale' },
  { doc_type: 'bl',                doc_name: 'Bill of Lading (B/L)',          sort_order: 1,  required: true,  owner: 'logistics' },
  { doc_type: 'commercial_invoice',doc_name: 'Commercial Invoice',            sort_order: 2,  required: true,  owner: 'accounting' },
  { doc_type: 'packing_list',      doc_name: 'Packing List',                  sort_order: 3,  required: true,  owner: 'logistics' },
  { doc_type: 'coa',               doc_name: 'Certificate of Analysis (COA)', sort_order: 4,  required: true,  owner: 'production' },
  { doc_type: 'co',                doc_name: 'Certificate of Origin (C/O)',   sort_order: 5,  required: true,  owner: 'logistics' },
  { doc_type: 'form_ae',           doc_name: 'Form A/E',                      sort_order: 6,  required: false, owner: 'logistics' },
  { doc_type: 'phytosanitary',     doc_name: 'Phytosanitary Certificate',     sort_order: 7,  required: false, owner: 'logistics' },
  { doc_type: 'fumigation',        doc_name: 'Fumigation Certificate',        sort_order: 8,  required: false, owner: 'logistics' },
  { doc_type: 'lc_copy',           doc_name: 'LC Copy (Thư tín dụng)',        sort_order: 9,  required: false, owner: 'accounting' },
  { doc_type: 'insurance',         doc_name: 'Insurance Certificate',         sort_order: 10, required: false, owner: 'logistics' },
  { doc_type: 'weight_note',       doc_name: 'Weight Note (Phiếu cân)',       sort_order: 11, required: false, owner: 'production' },
  { doc_type: 'other',             doc_name: 'Chứng từ khác',                 sort_order: 99, required: false, owner: 'all' },
]

// Kiểm tra role có quyền upload chứng từ này không
export function canEditDocument(docType: string, role: string | null): boolean {
  if (!role) return false
  if (role === 'admin') return true
  const doc = STANDARD_DOCUMENTS.find(d => d.doc_type === docType)
  if (!doc) return false
  return doc.owner === role || doc.owner === 'all'
}

// Quyền xem/tải: mỗi BP xem CT của mình + CT chung. Không xem CT BP khác.
// viewers: danh sách role được XEM (ngoài owner + admin)
// ★ contract: KHÔNG ai xem qua checklist tab — hợp đồng được xử lý riêng tại
//   ContractTab + salesContractService (chỉ BGĐ + sale-uploader xem được).
const DOC_VIEWERS: Record<string, string[]> = {
  contract:           [],  // ★ Hợp đồng: dùng salesContractService, không hiện ở checklist
  bl:                 ['logistics', 'accounting'],        // B/L — LOG + KT
  commercial_invoice: ['accounting'],                     // Invoice — chỉ KT
  packing_list:       ['logistics', 'production'],        // PL — LOG + SX
  coa:                ['production', 'logistics'],        // COA — SX + LOG
  co:                 ['logistics', 'accounting'],        // C/O — LOG + KT
  form_ae:            ['logistics'],
  phytosanitary:      ['logistics'],
  fumigation:         ['logistics'],
  lc_copy:            ['accounting'],                     // LC — chỉ KT
  insurance:          ['logistics', 'accounting'],
  weight_note:        ['production', 'logistics'],        // Phiếu cân — SX + LOG
  other:              ['sale', 'logistics', 'accounting', 'production'],  // CT khác — ai cũng xem
}

export function canViewDocument(docType: string, role: string | null): boolean {
  if (!role) return false
  if (role === 'admin') return true
  const viewers = DOC_VIEWERS[docType]
  if (!viewers) return false
  return viewers.includes(role)
}

// ============================================================================
// SERVICE
// ============================================================================

export const salesDocumentUploadService = {

  /** Lấy danh sách chứng từ của đơn hàng */
  async getByOrderId(orderId: string): Promise<SalesDocument[]> {
    const { data, error } = await supabase
      .from('sales_order_documents')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('sort_order')

    if (error) { console.error('[salesDoc] getByOrderId error:', error); return [] }
    return data || []
  },

  /** Khởi tạo checklist chứng từ chuẩn cho đơn hàng (chạy 1 lần) */
  async initChecklist(orderId: string): Promise<SalesDocument[]> {
    // Check if already initialized
    const existing = await this.getByOrderId(orderId)
    if (existing.length > 0) return existing

    const rows = STANDARD_DOCUMENTS.map(d => ({
      sales_order_id: orderId,
      doc_type: d.doc_type,
      doc_name: d.doc_name,
      sort_order: d.sort_order,
      is_received: false,
    }))

    const { data, error } = await supabase
      .from('sales_order_documents')
      .insert(rows)
      .select('*')

    if (error) { console.error('[salesDoc] initChecklist error:', error); return [] }
    return data || []
  },

  /** Upload file cho 1 chứng từ */
  async uploadFile(docId: string, orderId: string, file: File, uploadedBy?: string): Promise<string | null> {
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const path = `orders/${orderId}/${docId}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('sales-documents')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('sales-documents')
        .getPublicUrl(path)

      // Update document record
      await supabase.from('sales_order_documents').update({
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        is_received: true,
        received_at: new Date().toISOString(),
        uploaded_by: uploadedBy || null,
        updated_at: new Date().toISOString(),
      }).eq('id', docId)

      return publicUrl
    } catch (e) {
      console.error('[salesDoc] uploadFile error:', e)
      return null
    }
  },

  /** Đánh dấu đã nhận (không upload file) */
  async markReceived(docId: string, received: boolean): Promise<void> {
    await supabase.from('sales_order_documents').update({
      is_received: received,
      received_at: received ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', docId)
  },

  /** Thêm chứng từ tùy chỉnh */
  async addCustomDocument(orderId: string, docName: string): Promise<SalesDocument | null> {
    const { data, error } = await supabase
      .from('sales_order_documents')
      .insert({
        sales_order_id: orderId,
        doc_type: 'other',
        doc_name: docName,
        sort_order: 99,
        is_received: false,
      })
      .select('*')
      .single()

    if (error) return null
    return data
  },

  /** Xóa chứng từ */
  async deleteDocument(docId: string): Promise<boolean> {
    const { error } = await supabase.from('sales_order_documents').delete().eq('id', docId)
    return !error
  },

  /** Thống kê */
  async getStats(orderId: string): Promise<{ total: number; received: number; uploaded: number }> {
    const docs = await this.getByOrderId(orderId)
    return {
      total: docs.length,
      received: docs.filter(d => d.is_received).length,
      uploaded: docs.filter(d => d.file_url).length,
    }
  },
}
