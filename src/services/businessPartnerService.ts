// src/services/businessPartnerService.ts
//
// Facade cho Business Partner master (HAC-13 v10).
// Gộp KH + NCC + đại lý B2B + hộ NCC mủ vào 1 entity duy nhất với nhiều vai trò.
//
// DB schema:
//   business_partners  : info chung (HAC-13, tên, MST, địa chỉ, bank...)
//   bp_roles           : vai trò (CUSTOMER_INTL, SUPPLIER_GENERAL, PARTNER_B2B, RUBBER_SUPPLIER)
//                        + role_data jsonb cho thuộc tính riêng

import { supabase } from '../lib/supabase'
import { normalizeHac13 } from '../lib/hac13'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BpTypeCode = 1 | 2 // 1=VN, 2=Foreign (3 reserved cho employees)
export type BpStatus = 'active' | 'inactive' | 'blocked' | 'pending'

export type BpRoleType =
  | 'CUSTOMER_INTL'
  | 'CUSTOMER_DOM'
  | 'SUPPLIER_GENERAL'
  | 'PARTNER_B2B'
  | 'RUBBER_SUPPLIER'

export interface BusinessPartner {
  id: string
  hac13_code: string
  type_code: BpTypeCode
  legal_name: string
  short_name: string | null
  tax_code: string | null
  cccd: string | null
  reg_number: string | null
  country_iso: string
  province_gso: string | null
  region_iso: string | null
  district: string | null
  ward: string | null
  address_line: string | null
  phone: string | null
  email: string | null
  website: string | null
  bank_name: string | null
  bank_account: string | null
  bank_holder: string | null
  bank_branch: string | null
  bank_swift: string | null
  status: BpStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface BpRole {
  id: string
  bp_id: string
  role_type: BpRoleType
  role_data: Record<string, unknown>
  is_primary: boolean
  status: 'active' | 'inactive' | 'suspended'
  activated_at: string
  deactivated_at: string | null
}

export interface BusinessPartnerWithRoles extends BusinessPartner {
  roles: BpRole[]
}

/** Input để tạo 1 role mới đính kèm BP. */
export interface RoleInput {
  role_type: BpRoleType
  role_data?: Record<string, unknown>
  is_primary?: boolean
}

/** Input để tạo BP atomic (qua RPC). */
export interface CreateBpInput {
  legal_name: string
  country_iso?: string
  tax_code?: string
  cccd?: string
  short_name?: string
  province_gso?: string
  region_iso?: string
  address_line?: string
  phone?: string
  email?: string
  roles?: RoleInput[]
}

export interface UpdateBpInput {
  legal_name?: string
  short_name?: string | null
  tax_code?: string | null
  cccd?: string | null
  reg_number?: string | null
  country_iso?: string
  province_gso?: string | null
  region_iso?: string | null
  district?: string | null
  ward?: string | null
  address_line?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_holder?: string | null
  bank_branch?: string | null
  bank_swift?: string | null
  status?: BpStatus
  notes?: string | null
}

export interface ListBpParams {
  page?: number
  pageSize?: number
  search?: string
  typeCode?: BpTypeCode
  countryIso?: string
  roleType?: BpRoleType
  status?: BpStatus
}

export interface ListBpResult {
  data: BusinessPartner[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const businessPartnerService = {
  /** Tạo BP với danh sách roles (atomic, qua Postgres function). */
  async create(input: CreateBpInput): Promise<BusinessPartner> {
    const { data, error } = await supabase.rpc('rpc_create_bp_with_roles', {
      p_legal_name: input.legal_name,
      p_country_iso: input.country_iso ?? 'VN',
      p_tax_code: input.tax_code ?? null,
      p_cccd: input.cccd ?? null,
      p_short_name: input.short_name ?? null,
      p_province_gso: input.province_gso ?? null,
      p_region_iso: input.region_iso ?? null,
      p_address_line: input.address_line ?? null,
      p_phone: input.phone ?? null,
      p_email: input.email ?? null,
      p_roles: input.roles ?? [],
    })
    if (error) throw error
    return data as BusinessPartner
  },

  /** Cập nhật info chung (không sửa được hac13_code, type_code). */
  async update(id: string, patch: UpdateBpInput): Promise<BusinessPartner> {
    const { data, error } = await supabase
      .from('business_partners')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as BusinessPartner
  },

  /** Soft delete (set deleted_at). Không cascade — bp_roles giữ nguyên. */
  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('business_partners')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', id)
    if (error) throw error
  },

  /** Lấy BP theo id, kèm tất cả roles. */
  async getById(id: string): Promise<BusinessPartnerWithRoles | null> {
    const { data: bp, error } = await supabase
      .from('business_partners')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!bp) return null

    const { data: roles, error: rolesErr } = await supabase
      .from('bp_roles')
      .select('*')
      .eq('bp_id', id)
    if (rolesErr) throw rolesErr

    return { ...(bp as BusinessPartner), roles: (roles ?? []) as BpRole[] }
  },

  /** Tìm BP theo hac13_code (chấp nhận dấu gạch ngang). */
  async findByHac13Code(code: string): Promise<BusinessPartner | null> {
    const normalized = normalizeHac13(code)
    const { data, error } = await supabase
      .from('business_partners')
      .select('*')
      .eq('hac13_code', normalized)
      .maybeSingle()
    if (error) throw error
    return data as BusinessPartner | null
  },

  /** Tìm BP theo MST (dùng trước khi tạo mới để cảnh báo trùng). */
  async findByTaxCode(taxCode: string): Promise<BusinessPartner | null> {
    const { data, error } = await supabase
      .from('business_partners')
      .select('*')
      .eq('tax_code', taxCode)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data as BusinessPartner | null
  },

  /** Tìm BP qua bp_search_keys (TAX_CODE, EMAIL, PHONE, CCCD, ALIAS). */
  async searchByKey(keyValue: string): Promise<BusinessPartner[]> {
    const { data, error } = await supabase
      .from('bp_search_keys')
      .select('bp_id, key_type, key_value, business_partner:business_partners!fk_bp_search_keys_bp_id(*)')
      .ilike('key_value', `%${keyValue}%`)
      .limit(20)
    if (error) throw error
    return (data ?? [])
      .map((row) => (row as unknown as { business_partner: BusinessPartner }).business_partner)
      .filter((bp): bp is BusinessPartner => Boolean(bp))
  },

  /** List có phân trang + filter. */
  async list(params: ListBpParams = {}): Promise<ListBpResult> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('business_partners')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)

    if (params.typeCode) query = query.eq('type_code', params.typeCode)
    if (params.countryIso) query = query.eq('country_iso', params.countryIso)
    if (params.status) query = query.eq('status', params.status)

    if (params.search) {
      const s = params.search.trim()
      const normalized = normalizeHac13(s)
      // Try exact match HAC-13 first, else fuzzy on legal_name/tax_code
      if (/^\d{13}$/.test(normalized)) {
        query = query.eq('hac13_code', normalized)
      } else {
        query = query.or(
          `legal_name.ilike.%${s}%,short_name.ilike.%${s}%,tax_code.ilike.%${s}%,email.ilike.%${s}%`,
        )
      }
    }

    // Filter by role_type cần subquery
    if (params.roleType) {
      const { data: bpIds } = await supabase
        .from('bp_roles')
        .select('bp_id')
        .eq('role_type', params.roleType)
        .eq('status', 'active')
      const ids = (bpIds ?? []).map((r: { bp_id: string }) => r.bp_id)
      if (ids.length === 0) {
        return { data: [], total: 0, page, pageSize, totalPages: 0 }
      }
      query = query.in('id', ids)
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data ?? []) as BusinessPartner[],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },

  // ─── Roles ────────────────────────────────────────────────────────────────

  async getRoles(bpId: string): Promise<BpRole[]> {
    const { data, error } = await supabase
      .from('bp_roles')
      .select('*')
      .eq('bp_id', bpId)
      .order('activated_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as BpRole[]
  },

  async addRole(
    bpId: string,
    roleType: BpRoleType,
    roleData: Record<string, unknown> = {},
    isPrimary = false,
  ): Promise<BpRole> {
    const { data, error } = await supabase
      .from('bp_roles')
      .insert({ bp_id: bpId, role_type: roleType, role_data: roleData, is_primary: isPrimary })
      .select('*')
      .single()
    if (error) throw error
    return data as BpRole
  },

  async updateRoleData(roleId: string, roleData: Record<string, unknown>): Promise<BpRole> {
    const { data, error } = await supabase
      .from('bp_roles')
      .update({ role_data: roleData })
      .eq('id', roleId)
      .select('*')
      .single()
    if (error) throw error
    return data as BpRole
  },

  async deactivateRole(roleId: string): Promise<void> {
    const { error } = await supabase
      .from('bp_roles')
      .update({ status: 'inactive', deactivated_at: new Date().toISOString() })
      .eq('id', roleId)
    if (error) throw error
  },
}

export default businessPartnerService
