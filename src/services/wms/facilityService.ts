// ============================================================================
// FACILITY SERVICE — Quản lý nhà máy (multi-facility F1)
// File: src/services/wms/facilityService.ts
// Doc: docs/MULTI_FACILITY_WORKFLOW.md
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface Facility {
  id: string
  code: string                         // 'PD', 'TL', 'LAO'
  name: string
  address?: string | null
  region?: string | null
  country?: string | null
  manager_employee_id?: string | null
  phone?: string | null
  gps_lat?: number | null
  gps_lng?: number | null
  timezone?: string | null
  can_ship_to_customer: boolean       // chỉ true cho PD
  weighbridge_subdomain?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export const facilityService = {
  /**
   * Lấy tất cả facilities active (cho dropdown).
   */
  async getAllActive(): Promise<Facility[]> {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true })

    if (error) throw error
    return (data || []) as Facility[]
  },

  /**
   * Lấy 1 facility theo id.
   */
  async getById(id: string): Promise<Facility | null> {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as Facility
  },

  /**
   * Lấy facility theo code (VD 'PD', 'TL', 'LAO') — tiện cho sub-app
   * weighbridge xác định facility từ env VITE_FACILITY_CODE.
   */
  async getByCode(code: string): Promise<Facility | null> {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (error) throw error
    return data as Facility | null
  },

  /**
   * Lấy facilities cho phép xuất khẩu trực tiếp (can_ship_to_customer=true).
   * Hiện chỉ Phong Điền.
   */
  async getShippingFacilities(): Promise<Facility[]> {
    const { data, error } = await supabase
      .from('facilities')
      .select('*')
      .eq('is_active', true)
      .eq('can_ship_to_customer', true)
      .order('code')

    if (error) throw error
    return (data || []) as Facility[]
  },

  /**
   * Update facility (BGD only).
   */
  async update(id: string, patch: Partial<Facility>): Promise<Facility> {
    const { data, error } = await supabase
      .from('facilities')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as Facility
  },
}

export default facilityService
