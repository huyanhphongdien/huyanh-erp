// ============================================================================
// FINANCE — Đính kèm tài liệu (Đợt 3b)
// File: src/services/finance/attachmentService.ts
// Bucket PRIVATE 'finance-docs' + bảng fin_attachments (polymorphic).
// ============================================================================
import { supabase } from '../../lib/supabase'

export type AttachEntity = 'loan' | 'deposit' | 'credit_line' | 'interest' | 'repayment' | 'collateral'

export interface FinAttachment {
  id: string
  entity_type: AttachEntity
  entity_id: string
  doc_type: string | null
  file_name: string
  file_path: string
  file_size: number | null
  mime_type: string | null
  note: string | null
  uploaded_by: string | null
  uploaded_at: string
}

const BUCKET = 'finance-docs'

// Gợi ý loại chứng từ theo đối tượng
export const DOC_TYPES: Record<AttachEntity, string[]> = {
  loan: ['Khế ước nhận nợ', 'HĐ tín dụng', 'Lịch trả nợ NH', 'Sao kê', 'Khác'],
  deposit: ['Sổ/Giấy CN tiền gửi', 'Giấy gia hạn', 'Khác'],
  credit_line: ['HĐ hạn mức', 'Phụ lục', 'Khác'],
  interest: ['Ủy nhiệm chi (lãi)', 'Chứng từ', 'Khác'],
  repayment: ['Ủy nhiệm chi (gốc)', 'Chứng từ', 'Khác'],
  collateral: ['HĐ bảo đảm', 'Biên bản định giá', 'Giấy tờ tài sản', 'Khác'],
}

const sanitize = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '')   // bỏ dấu tiếng Việt
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/_+/g, '_')

export const attachmentService = {
  async list(entityType: AttachEntity, entityId: string): Promise<FinAttachment[]> {
    const { data, error } = await supabase.from('fin_attachments')
      .select('*').eq('entity_type', entityType).eq('entity_id', entityId)
      .order('uploaded_at', { ascending: false })
    if (error) throw error
    return (data as FinAttachment[]) || []
  },

  /** Đếm số file cho nhiều entity (vd hiện badge 📎 trên danh sách). */
  async countFor(entityType: AttachEntity, entityIds: string[]): Promise<Map<string, number>> {
    const m = new Map<string, number>()
    if (!entityIds.length) return m
    const { data, error } = await supabase.from('fin_attachments')
      .select('entity_id').eq('entity_type', entityType).in('entity_id', entityIds)
    if (error) throw error
    for (const r of (data as any[]) || []) m.set(r.entity_id, (m.get(r.entity_id) || 0) + 1)
    return m
  },

  async upload(file: File, opts: { entityType: AttachEntity; entityId: string; docType?: string; note?: string; uploadedBy?: string | null }): Promise<FinAttachment> {
    const path = `${opts.entityType}/${opts.entityId}/${Date.now()}-${sanitize(file.name)}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined })
    if (upErr) throw upErr
    const { data, error } = await supabase.from('fin_attachments').insert({
      entity_type: opts.entityType, entity_id: opts.entityId, doc_type: opts.docType || null,
      file_name: file.name, file_path: path, file_size: file.size, mime_type: file.type || null,
      note: opts.note || null, uploaded_by: opts.uploadedBy || null,
    }).select('*').single()
    if (error) {
      // rollback file nếu ghi DB lỗi
      await supabase.storage.from(BUCKET).remove([path]).catch(() => null)
      throw error
    }
    return data as FinAttachment
  },

  /** Signed URL (mặc định 5 phút) để xem/tải file private. */
  async signedUrl(path: string, expiresSec = 300): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresSec)
    if (error) throw error
    return data.signedUrl
  },

  async remove(att: FinAttachment): Promise<void> {
    await supabase.storage.from(BUCKET).remove([att.file_path]).catch(() => null)
    const { error } = await supabase.from('fin_attachments').delete().eq('id', att.id)
    if (error) throw error
  },
}
