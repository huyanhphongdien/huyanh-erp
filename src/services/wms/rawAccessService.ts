// ============================================================================
// KHO NGUYÊN LIỆU MỦ — quyền & thủ kho (GĐ0)
// File: src/services/wms/rawAccessService.ts
//
// Luật ký nằm ở DB (fn_nvl_duoc_ky). Service này chỉ HỎI DB ai được làm gì
// (fn_nvl_quyen) và quản lý danh sách thủ kho (raw_store_keepers, BGĐ ghi).
// Không có danh sách email cứng ở đây — thêm thủ kho = thêm dòng trong bảng.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { RAW_PERMISSIONS_NONE, type RawPermissions, type RawStoreKeeper } from './raw.types'

export const rawAccessService = {
  /** Quyền của người đang đăng nhập cho một nhà máy (null = chung). */
  async getPermissions(facilityId?: string | null): Promise<RawPermissions> {
    const { data, error } = await supabase.rpc('fn_nvl_quyen', { p_facility_id: facilityId ?? null })
    if (error) throw error
    return { ...RAW_PERMISSIONS_NONE, ...((data ?? {}) as Partial<RawPermissions>) }
  },

  /** Hỏi DB một bước cụ thể — dùng ngay trước khi ghi để không tin cache của UI. */
  async canSign(step: string, facilityId?: string | null): Promise<boolean> {
    const { data, error } = await supabase.rpc('fn_nvl_duoc_ky', { p_buoc: step, p_facility_id: facilityId ?? null })
    if (error) throw error
    return data === true
  },

  async listKeepers(includeRevoked = false): Promise<RawStoreKeeper[]> {
    let q = supabase
      .from('raw_store_keepers')
      .select('id, employee_id, facility_id, granted_at, revoked_at, is_active, notes, employee:employees(full_name, email), facility:facilities(code, name)')
      .order('granted_at', { ascending: false })
    if (!includeRevoked) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as RawStoreKeeper[]
  },

  /** BGĐ cấp quyền thủ kho. facilityId null = mọi nhà máy. */
  async grant(employeeId: string, facilityId: string | null, notes?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    let grantedBy: string | null = null
    if (user) {
      const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
      grantedBy = me?.id ?? null
    }
    const { error } = await supabase.from('raw_store_keepers').insert({
      employee_id: employeeId,
      facility_id: facilityId,
      granted_by: grantedBy,
      notes: notes ?? null,
    })
    if (error) throw error
  },

  /** Thu quyền: giữ dòng để còn lịch sử, chỉ tắt is_active. */
  async revoke(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    let revokedBy: string | null = null
    if (user) {
      const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
      revokedBy = me?.id ?? null
    }
    const { error } = await supabase
      .from('raw_store_keepers')
      .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: revokedBy })
      .eq('id', id)
    if (error) throw error
  },
}
