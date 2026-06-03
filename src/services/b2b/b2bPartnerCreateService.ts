// ============================================================================
// B2B PARTNER CREATE SERVICE — Tạo đại lý B2B (cá nhân hoặc DN) cho weighbridge
// File: src/services/b2b/b2bPartnerCreateService.ts
// ============================================================================
//
// Khác với partnerQuickCreateService.ts (chỉ quick-create household CCCD cho
// walk-in flow), service này hỗ trợ cả 2 loại đầy đủ:
//   - Cá nhân (CCCD + tên)
//   - Doanh nghiệp (MST + tên)
//
// Sau khi INSERT b2b.partners, trigger DB `ensure_bp_for_b2b_partner` tự:
//   - Tạo business_partners master (HAC-13)
//   - Overwrite b2b.partners.code = hac13_code
//   - Lưu code legacy vào bp_search_keys.ALIAS

import { supabase } from '../../lib/supabase'

export type B2BPartnerKind = 'individual' | 'company'

export interface CreateB2BPartnerInput {
  kind: B2BPartnerKind
  name: string                        // bắt buộc
  phone: string                       // bắt buộc (b2b.partners NOT NULL)
  national_id?: string                // CCCD — cho individual
  tax_code?: string                   // MST — cho company
  address?: string
  email?: string
  partner_type?: 'dealer' | 'supplier' | 'processor' | 'household'
  tier?: 'new' | 'bronze' | 'silver' | 'gold' | 'diamond'
  notes?: string
}

export interface CreatedPartner {
  id: string
  code: string                        // HAC-13 (sau trigger)
  name: string
  partner_type: string
  tier: string
  is_new: boolean
}

const VN_PHONE_RE = /^(\+84|0)\d{9}$/

export function validatePhone(phone: string): { valid: boolean; reason?: string } {
  if (!phone) return { valid: false, reason: 'Số điện thoại bắt buộc' }
  const clean = phone.trim().replace(/\s|-/g, '')
  if (!VN_PHONE_RE.test(clean)) {
    return { valid: false, reason: 'Số điện thoại không đúng format VN (0xxx 10 số hoặc +84xxx)' }
  }
  return { valid: true }
}

export function validateCCCD(cccd: string): { valid: boolean; reason?: string } {
  if (!cccd) return { valid: false, reason: 'CCCD bắt buộc' }
  const c = cccd.trim().replace(/\s+/g, '')
  if (!/^\d{12}$/.test(c)) return { valid: false, reason: 'CCCD phải đúng 12 chữ số' }
  return { valid: true }
}

export function validateTaxCode(mst: string): { valid: boolean; reason?: string } {
  if (!mst) return { valid: false, reason: 'MST bắt buộc' }
  const m = mst.trim().replace(/\s|-/g, '')
  if (!/^\d{10}(\d{3})?$/.test(m)) {
    return { valid: false, reason: 'MST phải 10 hoặc 13 chữ số' }
  }
  return { valid: true }
}

export const b2bPartnerCreateService = {
  /**
   * Tìm partner đã có theo CCCD / MST / SĐT trước khi tạo mới (de-dup).
   */
  async findExisting(input: { national_id?: string; tax_code?: string; phone?: string }): Promise<CreatedPartner | null> {
    if (input.national_id) {
      const clean = input.national_id.trim().replace(/\s+/g, '')
      const { data } = await supabase
        .from('b2b_partners')
        .select('id, code, name, partner_type, tier')
        .eq('national_id', clean)
        .maybeSingle()
      if (data) return { ...(data as Omit<CreatedPartner, 'is_new'>), is_new: false }
    }
    // Chống trùng SĐT — cùng số điện thoại = cùng đối tác (match SĐT trùng)
    if (input.phone) {
      const cleanPhone = input.phone.trim().replace(/\s|-/g, '')
      const { data } = await supabase
        .from('b2b_partners')
        .select('id, code, name, partner_type, tier')
        .eq('phone', cleanPhone)
        .limit(1)
      if (data && data.length > 0) return { ...(data[0] as Omit<CreatedPartner, 'is_new'>), is_new: false }
    }
    if (input.tax_code) {
      // Tax code lookup qua bp_search_keys (nếu BP đã có)
      const { data: sk } = await supabase
        .from('bp_search_keys')
        .select('bp_id')
        .eq('key_type', 'TAX_CODE')
        .eq('key_value', input.tax_code)
        .maybeSingle()
      if (sk) {
        const { data: p } = await supabase
          .from('b2b_partners')
          .select('id, code, name, partner_type, tier')
          .eq('bp_id', (sk as { bp_id: string }).bp_id)
          .maybeSingle()
        if (p) return { ...(p as Omit<CreatedPartner, 'is_new'>), is_new: false }
      }
    }
    return null
  },

  /**
   * Tìm đại lý TRÙNG TÊN (so khớp chính xác, không phân biệt hoa thường).
   * Dùng để CẢNH BÁO mềm — KHÔNG chặn cứng (trùng tên là hợp lệ, người khác nhau).
   */
  async findByName(name: string): Promise<{ code: string; name: string; phone: string | null }[]> {
    const clean = name.trim()
    if (clean.length < 2) return []
    const { data } = await supabase
      .from('b2b_partners')
      .select('code, name, phone')
      .ilike('name', clean)
      .limit(5)
    return (data as { code: string; name: string; phone: string | null }[]) || []
  },

  /**
   * Tạo partner mới (cá nhân hoặc DN).
   * Logic:
   *   1. Validate input
   *   2. Tìm existing (CCCD/MST) → reuse nếu có
   *   3. INSERT b2b.partners → trigger tự tạo BP master + HAC-13
   */
  async create(input: CreateB2BPartnerInput): Promise<CreatedPartner> {
    // Validate
    if (!input.name?.trim() || input.name.trim().length < 2) {
      throw new Error('Tên đại lý bắt buộc (tối thiểu 2 ký tự)')
    }
    const phoneCheck = validatePhone(input.phone)
    if (!phoneCheck.valid) throw new Error(phoneCheck.reason)

    if (input.kind === 'individual') {
      if (!input.national_id) throw new Error('CCCD bắt buộc cho cá nhân')
      const cccdCheck = validateCCCD(input.national_id)
      if (!cccdCheck.valid) throw new Error(cccdCheck.reason)
    } else {
      if (!input.tax_code) throw new Error('MST bắt buộc cho doanh nghiệp')
      const mstCheck = validateTaxCode(input.tax_code)
      if (!mstCheck.valid) throw new Error(mstCheck.reason)
    }

    // De-dup
    const existing = await this.findExisting({
      national_id: input.national_id,
      tax_code: input.tax_code,
      phone: input.phone,
    })
    if (existing) return existing

    // Default partner_type/tier
    const partnerType = input.partner_type ?? (input.kind === 'individual' ? 'household' : 'supplier')
    const tier = input.tier ?? 'new'

    // Tạo placeholder code 'PENDING-{timestamp}' — trigger sẽ overwrite = hac13_code
    const placeholderCode = `PENDING-${Date.now().toString().slice(-8)}`

    const insertPayload: Record<string, unknown> = {
      code: placeholderCode,
      name: input.name.trim(),
      phone: input.phone.trim(),
      partner_type: partnerType,
      tier,
      status: 'verified',
      is_active: true,
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
      national_id: input.national_id?.trim() || null,
      // Note: b2b.partners không có cột tax_code → MST sẽ lưu qua bp_search_keys (do trigger BP)
    }

    const { data, error } = await supabase
      .from('b2b_partners')
      .insert(insertPayload)
      .select('id, code, name, partner_type, tier, bp_id')
      .single()

    if (error) throw error
    const partner = data as { id: string; code: string; name: string; partner_type: string; tier: string; bp_id: string | null }

    // Nếu là DN + có tax_code → lưu tax_code vào bp_search_keys + business_partners
    if (input.kind === 'company' && input.tax_code && partner.bp_id) {
      try {
        await supabase
          .from('business_partners')
          .update({ tax_code: input.tax_code.trim() })
          .eq('id', partner.bp_id)
        await supabase
          .from('bp_search_keys')
          .insert({
            bp_id: partner.bp_id,
            key_type: 'TAX_CODE',
            key_value: input.tax_code.trim(),
            notes: 'Quick-create từ weighbridge',
          })
      } catch (e) {
        console.warn('[b2bPartnerCreate] không set được tax_code:', e)
      }
    }

    return {
      id: partner.id,
      code: partner.code,   // = HAC-13 sau khi trigger chạy
      name: partner.name,
      partner_type: partner.partner_type,
      tier: partner.tier,
      is_new: true,
    }
  },
}

export default b2bPartnerCreateService
