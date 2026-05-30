// ============================================================================
// COMPLETION CERT SERVICE (ERP - phía NHÀ MÁY)
// File: src/services/b2b/completionCertService.ts
// MÔ TẢ: Phiếu chốt thành phẩm cho flow "Chạy đầu ra". Nhà máy lập phiếu từ
//        số liệu deal sau QC final, upload file, ký nhà máy → đẩy sang đại lý ký.
// BẢNG: b2b.production_completion_certs (schema b2b, truy cập qua .schema('b2b'))
// LIÊN QUAN: b2b.deal_supervisors (người giám sát đại lý), b2b.acceptances (pattern ký)
// ============================================================================
import { supabase } from '../../lib/supabase'
import { b2bNotificationService } from './b2bNotificationService'

export interface CompletionCert {
  id: string
  cert_number: string
  deal_id: string
  partner_id: string
  quantity_kg: number | null
  sample_drc: number | null
  actual_drc: number | null
  finished_product_kg: number | null
  unit_price: number | null
  final_value: number | null
  factory_file_url: string | null
  factory_file_name: string | null
  factory_signer_name: string | null
  factory_signed_at: string | null
  factory_signature_url: string | null
  supervisor_id: string | null
  partner_signer_name: string | null
  partner_signed_at: string | null
  partner_signature_url: string | null
  status: 'draft' | 'pending_partner' | 'fully_signed'
  note: string | null
  created_at: string
  updated_at: string
}

const TABLE = 'production_completion_certs'

export const completionCertService = {
  // Lấy phiếu của 1 deal (1 deal = tối đa 1 phiếu)
  async getByDeal(dealId: string): Promise<CompletionCert | null> {
    const { data, error } = await supabase
      .schema('b2b')
      .from(TABLE)
      .select('*')
      .eq('deal_id', dealId)
      .maybeSingle()
    if (error) { console.error('[completionCert] getByDeal', error); return null }
    return data as CompletionCert | null
  },

  // Nhà máy lập phiếu nháp từ số liệu deal (yêu cầu deal đã ra thành phẩm)
  async createDraft(dealId: string): Promise<CompletionCert> {
    const { data: deal, error: dErr } = await supabase
      .from('b2b_deals')
      .select('id, deal_number, partner_id, purchase_type, quantity_kg, sample_drc, actual_drc, finished_product_kg, unit_price, final_value')
      .eq('id', dealId)
      .maybeSingle()
    if (dErr) throw dErr
    if (!deal) throw new Error('Deal không tồn tại')
    if (deal.purchase_type !== 'drc_after_production') {
      throw new Error('Phiếu chốt thành phẩm chỉ áp dụng cho deal Chạy đầu ra')
    }
    if (!deal.finished_product_kg || deal.finished_product_kg <= 0) {
      throw new Error('Chưa có khối lượng thành phẩm — hoàn tất sản xuất trước khi lập phiếu')
    }

    const { data, error } = await supabase
      .schema('b2b')
      .from(TABLE)
      .insert({
        cert_number: `PCTP-${deal.deal_number}`,
        deal_id: deal.id,
        partner_id: deal.partner_id,
        quantity_kg: deal.quantity_kg,
        sample_drc: deal.sample_drc,
        actual_drc: deal.actual_drc,
        finished_product_kg: deal.finished_product_kg,
        unit_price: deal.unit_price,
        final_value: deal.final_value,
        status: 'draft',
      })
      .select()
      .single()
    if (error) throw error
    return data as CompletionCert
  },

  // Upload file phiếu (PDF/scan) lên bucket b2b-documents
  async uploadFactoryFile(dealId: string, file: File): Promise<{ url: string; name: string }> {
    const path = `completion-certs/${dealId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage
      .from('b2b-documents')
      .upload(path, file, { upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('b2b-documents').getPublicUrl(path)
    return { url: data.publicUrl, name: file.name }
  },

  async attachFactoryFile(id: string, url: string, name: string): Promise<void> {
    const { error } = await supabase
      .schema('b2b')
      .from(TABLE)
      .update({ factory_file_url: url, factory_file_name: name })
      .eq('id', id)
    if (error) throw error
  },

  // Upload ảnh chữ ký (canvas dataURL) → bucket b2b-signatures
  async uploadSignature(dataUrl: string, fileName: string): Promise<string> {
    const blob = await (await fetch(dataUrl)).blob()
    const { error } = await supabase.storage
      .from('b2b-signatures')
      .upload(fileName, blob, { contentType: 'image/png', upsert: true })
    if (error) throw error
    const { data } = supabase.storage.from('b2b-signatures').getPublicUrl(fileName)
    return data.publicUrl
  },

  // Nhà máy ký + chuyển trạng thái chờ đại lý ký → notify partner
  async factorySign(
    cert: CompletionCert,
    signerName: string,
    signatureUrl: string,
  ): Promise<void> {
    if (!cert.factory_file_url) {
      throw new Error('Cần upload file phiếu trước khi ký')
    }
    const { error } = await supabase
      .schema('b2b')
      .from(TABLE)
      .update({
        factory_signer_name: signerName,
        factory_signed_at: new Date().toISOString(),
        factory_signature_url: signatureUrl,
        status: 'pending_partner',
      })
      .eq('id', cert.id)
    if (error) throw error

    // Notify đại lý: có phiếu chốt thành phẩm chờ ký
    void b2bNotificationService.notify({
      type: 'completion_cert_pending',
      audience: 'partner',
      partner_id: cert.partner_id,
      deal_id: cert.deal_id,
      title: '📄 Phiếu chốt thành phẩm chờ ký',
      message: `Nhà máy đã lập & ký Phiếu chốt thành phẩm ${cert.cert_number}. Vui lòng kiểm tra số liệu và ký xác nhận.`,
      link_url: `/partner/orders/${cert.deal_id}`,
    })
  },
}

export default completionCertService
