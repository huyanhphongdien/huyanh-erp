// ============================================================================
// CUSTOMER EXPORT PROFILE SERVICE — Hồ sơ chứng từ theo khách (GĐ 1)
// File: src/services/sales/customerExportProfileService.ts
//
// Phần CỐ ĐỊNH theo khách của bộ chứng từ xuất khẩu: consignee, notify,
// shipping mark, ngân hàng thụ hưởng, checklist số bản chứng từ.
// Bảng: sales_customer_export_profiles (1–1 với sales_customers) + company_banks.
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface CompanyBank {
  id: string
  bank_name: string
  account_name: string | null
  account_no: string
  bank_address: string | null
  swift_code: string | null
  sort_order?: number
}

export interface DocChecklistItem {
  doc: string        // key trong EXPORT_DOC_TYPES
  originals: number  // số bản gốc
  copies: number     // số bản copy
}

export interface CustomerExportProfile {
  id?: string
  customer_id: string
  buyer_legal_name: string | null
  buyer_address: string | null
  consignee_name: string | null
  consignee_address: string | null
  notify_party: string | null
  notify_address: string | null
  shipping_marks: string | null
  attn_contacts: string | null
  preferred_bank_id: string | null
  default_payment_term: string | null
  doc_checklist: DocChecklistItem[]
  special_instructions: string | null
  // Template chiết khấu theo khách (đơn mới tự điền)
  default_payment_method?: 'lc' | 'dp' | 'da' | null   // L/C · Nhờ thu D/P · D/A
  default_counterparty_bank?: string | null            // NH phát hành L/C / NH nhờ thu (người mua)
  default_negotiate_pct?: number | null
  default_interest_rate?: number | null
  default_term_days?: number | null
  // Mặc định Commercial Invoice (ổn định theo khách → tự điền cho mọi đơn)
  default_item_no?: string | null              // ITEM NO. mặc định
  default_packing_desc?: string | null         // kiểu đóng gói mặc định (PACKING)
  default_invoice_extra_lines?: string | null  // dòng mô tả riêng mặc định
}

// Danh mục chứng từ chuẩn (dựng checklist). Khớp bộ thật + sheet "kHÁCH YÊU CẦU".
export const EXPORT_DOC_TYPES: { key: string; label: string }[] = [
  { key: 'BOE', label: 'Hối phiếu (Bill of Exchange)' },
  { key: 'CI', label: 'Commercial Invoice' },
  { key: 'PL', label: 'Packing List' },
  { key: 'WL', label: 'Weight List' },
  { key: 'COA', label: 'COA / Test Results' },
  { key: 'BL', label: 'Vận đơn (Bill of Lading)' },
  { key: 'CO', label: 'C/O (Giấy chứng nhận xuất xứ)' },
  { key: 'INS', label: 'Bảo hiểm hàng hóa (Insurance)' },
  { key: 'PHYTO', label: 'Phytosanitary / Fumigation' },
]

export const customerExportProfileService = {
  /** 7 tài khoản ngân hàng công ty (để chọn bank thụ hưởng). */
  async listBanks(): Promise<CompanyBank[]> {
    const { data, error } = await supabase
      .from('company_banks')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error
    return (data || []) as CompanyBank[]
  },

  /** Hồ sơ chứng từ của 1 khách (null nếu chưa tạo). */
  async getByCustomer(customerId: string): Promise<CustomerExportProfile | null> {
    const { data, error } = await supabase
      .from('sales_customer_export_profiles')
      .select('*')
      .eq('customer_id', customerId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return { ...data, doc_checklist: (data.doc_checklist || []) as DocChecklistItem[] } as CustomerExportProfile
  },

  /** Tạo/cập nhật hồ sơ (upsert theo customer_id). */
  async upsert(customerId: string, patch: Partial<CustomerExportProfile>): Promise<CustomerExportProfile> {
    const row = {
      ...patch,
      customer_id: customerId,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await supabase
      .from('sales_customer_export_profiles')
      .upsert(row, { onConflict: 'customer_id' })
      .select('*')
      .single()
    if (error) throw error
    return data as CustomerExportProfile
  },
}

export default customerExportProfileService
