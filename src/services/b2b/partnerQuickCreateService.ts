// ============================================================================
// Partner Quick Create Service — household/farmer walk-in
// File: src/services/b2b/partnerQuickCreateService.ts
// Phase 23 of B2B Intake v4
// ============================================================================
// Use case: Flow 🅲 farmer_walkin cần quick-create hộ nông dân tại weighbridge
// (1 lần đầu gặp, không có registration trước).
// Input tối thiểu: CCCD + họ tên + SĐT. Address optional.
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface HouseholdInput {
  national_id: string        // CCCD 12 số VN (bắt buộc)
  name: string               // Họ tên (bắt buộc)
  phone?: string             // SĐT (khuyến nghị)
  address?: string
  nationality?: 'VN' | 'LAO' // default VN
  notes?: string
}

export interface HouseholdResult {
  id: string
  code: string
  national_id: string
  name: string
  tier: string
  partner_type: string
  is_new: boolean  // true = vừa tạo; false = đã tồn tại, reuse
}

/**
 * Validate CCCD Việt Nam 12 số.
 * Format: 3 số đầu = mã tỉnh, 1 số = thế kỷ+giới tính, 2 số = năm sinh, 6 số = random
 * Regex đơn giản: 12 digit.
 * Hộ LAO: partner_type='household' không áp dụng (theo roadmap v4 default 9).
 */
export function validateVietnameseCCCD(cccd: string): { valid: boolean; reason?: string } {
  if (!cccd) return { valid: false, reason: 'CCCD không được để trống' }
  const trimmed = cccd.trim().replace(/\s+/g, '')
  if (!/^\d{12}$/.test(trimmed)) {
    return { valid: false, reason: 'CCCD phải đúng 12 số, không chứa chữ/khoảng trắng' }
  }
  // First 3 digits = mã tỉnh (001-096). Simple range check.
  const provinceCode = parseInt(trimmed.slice(0, 3), 10)
  if (provinceCode < 1 || provinceCode > 96) {
    return { valid: false, reason: 'CCCD không hợp lệ: mã tỉnh ngoài khoảng 001-096' }
  }
  return { valid: true }
}

/**
 * Validate phone VN (optional).
 */
export function validateVietnamesePhone(phone?: string): boolean {
  if (!phone) return true  // optional
  const clean = phone.trim().replace(/[^\d+]/g, '')
  // +84xxxxxxxxx hoặc 0xxxxxxxxx (10 số)
  return /^(\+84|0)\d{9}$/.test(clean)
}

/**
 * Generate code cho household: HG-<CCCD 4 số cuối> (HouseHolds Group).
 * Nếu trùng → thêm suffix timestamp.
 */
async function generateHouseholdCode(cccd: string): Promise<string> {
  const suffix = cccd.slice(-4)
  const baseCode = `HG-${suffix}`

  // Check collision
  const { data } = await supabase
    .from('b2b_partners')
    .select('code')
    .eq('code', baseCode)
    .maybeSingle()

  if (!data) return baseCode

  // Collision → add timestamp
  const ts = Date.now().toString().slice(-4)
  return `${baseCode}-${ts}`
}

/**
 * Quick-create hộ nông dân.
 *
 * - Nếu CCCD đã tồn tại trong b2b.partners → reuse (is_new=false)
 * - Nếu chưa → tạo mới với partner_type='household', tier='new', status='verified'
 *
 * Lưu ý nationality: roadmap v4 default 9 cho biết hộ LAO KHÔNG đi flow 🅲
 * (đi flow 🅰️ outright qua đại lý). Service chỉ chấp nhận nationality='VN'.
 */
export async function quickCreateHousehold(input: HouseholdInput): Promise<HouseholdResult> {
  // Validate CCCD
  const cccdCheck = validateVietnameseCCCD(input.national_id)
  if (!cccdCheck.valid) {
    throw new Error(`CCCD không hợp lệ: ${cccdCheck.reason}`)
  }

  // Validate phone (optional)
  if (input.phone && !validateVietnamesePhone(input.phone)) {
    throw new Error('Số điện thoại không đúng format VN (+84xxx hoặc 0xxx, 10 số)')
  }

  // Validate name
  if (!input.name?.trim() || input.name.trim().length < 2) {
    throw new Error('Họ tên bắt buộc, tối thiểu 2 ký tự')
  }

  const nationality = input.nationality || 'VN'
  if (nationality === 'LAO') {
    throw new Error(
      'Hộ LAO không đi flow walk-in. Theo roadmap default 9: hộ LAO đi flow outright qua đại lý.'
    )
  }

  const cccd = input.national_id.trim().replace(/\s+/g, '')

  // Lookup existing partner bằng CCCD
  const { data: existing } = await supabase
    .from('b2b_partners')
    .select('id, code, name, tier, partner_type, national_id')
    .eq('national_id', cccd)
    .maybeSingle()

  if (existing) {
    return {
      id: (existing as any).id,
      code: (existing as any).code,
      national_id: cccd,
      name: (existing as any).name,
      tier: (existing as any).tier,
      partner_type: (existing as any).partner_type,
      is_new: false,
    }
  }

  // Create new household
  const code = await generateHouseholdCode(cccd)

  const { data, error } = await supabase
    .from('b2b_partners')
    .insert({
      code,
      name: input.name.trim(),
      phone: input.phone || null,
      address: input.address || null,
      national_id: cccd,
      nationality,
      partner_type: 'household',
      tier: 'new',
      status: 'verified',  // walk-in không qua review, verified ngay
      notes: input.notes || null,
    })
    .select('id, code, name, tier, partner_type')
    .single()

  if (error) {
    throw new Error(`Tạo hộ nông dân thất bại: ${error.message}`)
  }

  return {
    id: (data as any).id,
    code: (data as any).code,
    national_id: cccd,
    name: (data as any).name,
    tier: (data as any).tier,
    partner_type: (data as any).partner_type,
    is_new: true,
  }
}

/**
 * Lookup household by CCCD (không tạo mới).
 * Dùng cho UI autocomplete khi gõ CCCD.
 */
export async function findHouseholdByCCCD(cccd: string): Promise<HouseholdResult | null> {
  const clean = cccd.trim().replace(/\s+/g, '')
  if (!/^\d{12}$/.test(clean)) return null

  const { data } = await supabase
    .from('b2b_partners')
    .select('id, code, name, tier, partner_type, national_id')
    .eq('national_id', clean)
    .maybeSingle()

  if (!data) return null
  return {
    id: (data as any).id,
    code: (data as any).code,
    national_id: clean,
    name: (data as any).name,
    tier: (data as any).tier,
    partner_type: (data as any).partner_type,
    is_new: false,
  }
}

export default {
  quickCreateHousehold,
  findHouseholdByCCCD,
  validateVietnameseCCCD,
  validateVietnamesePhone,
}
