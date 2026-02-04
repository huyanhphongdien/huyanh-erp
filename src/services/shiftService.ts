// ============================================================================
// SHIFT SERVICE - Quản lý ca làm việc
// File: src/services/shiftService.ts
// Huy Anh ERP System - Chấm công V2
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface Shift {
  id: string
  code: string
  name: string
  shift_category: 'short' | 'long' | 'admin'
  start_time: string   // TIME format: 'HH:MM:SS'
  end_time: string
  crosses_midnight: boolean
  standard_hours: number
  break_minutes: number
  late_threshold_minutes: number
  early_leave_threshold_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ShiftFormData {
  code: string
  name: string
  shift_category: 'short' | 'long' | 'admin'
  start_time: string
  end_time: string
  crosses_midnight?: boolean
  standard_hours: number
  break_minutes?: number
  late_threshold_minutes?: number
  early_leave_threshold_minutes?: number
  is_active?: boolean
}

export interface DepartmentShiftConfig {
  id: string
  department_id: string
  shift_id: string
  is_default: boolean
  created_at: string
  // Relations
  department?: { id: string; code: string; name: string }
  shift?: Shift
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  category?: string
  is_active?: boolean
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================================================
// SHIFT SERVICE
// ============================================================================

export const shiftService = {

  // ── Lấy danh sách ca có phân trang ──
  async getAll(params: PaginationParams): Promise<PaginatedResponse<Shift>> {
    const { page, pageSize, search, category, is_active } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('shifts')
      .select('*', { count: 'exact' })

    if (category && category !== 'all') {
      query = query.eq('shift_category', category)
    }

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }

    const { data, error, count } = await query
      .order('shift_category')
      .order('start_time')
      .range(from, to)

    if (error) throw error

    return {
      data: data || [],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize)
    }
  },

  // ── Lấy tất cả ca đang active (cho dropdown) ──
  async getAllActive(): Promise<Shift[]> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('is_active', true)
      .order('shift_category')
      .order('start_time')

    if (error) throw error
    return data || []
  },

  // ── Lấy theo ID ──
  async getById(id: string): Promise<Shift | null> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // ── Tạo mới ──
  async create(shift: ShiftFormData): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .insert(shift)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ── Cập nhật ──
  async update(id: string, shift: Partial<ShiftFormData>): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .update(shift)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ── Xóa ──
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ── Kiểm tra code đã tồn tại ──
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('shifts')
      .select('id', { count: 'exact', head: true })
      .eq('code', code)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { count } = await query
    return (count || 0) > 0
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DEPARTMENT SHIFT CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  // ── Lấy ca được phép cho 1 phòng ban ──
  async getShiftsForDepartment(departmentId: string): Promise<DepartmentShiftConfig[]> {
    const { data, error } = await supabase
      .from('department_shift_config')
      .select(`
        *,
        shift:shifts!department_shift_config_shift_id_fkey(*)
      `)
      .eq('department_id', departmentId)
      .order('is_default', { ascending: false })

    if (error) throw error
    return data || []
  },

  // ── Lấy ca mặc định cho 1 phòng ban ──
  async getDefaultShift(departmentId: string): Promise<Shift | null> {
    const { data, error } = await supabase
      .from('department_shift_config')
      .select(`
        shift:shifts!department_shift_config_shift_id_fkey(*)
      `)
      .eq('department_id', departmentId)
      .eq('is_default', true)
      .maybeSingle()

    if (error) throw error
    if (!data?.shift) return null
    
    // Handle array vs object
    const shift = Array.isArray(data.shift) ? data.shift[0] : data.shift
    return shift || null
  },

  // ── Lấy toàn bộ config (cho trang admin) ──
  async getAllDepartmentConfigs(): Promise<DepartmentShiftConfig[]> {
    const { data, error } = await supabase
      .from('department_shift_config')
      .select(`
        *,
        department:departments!department_shift_config_department_id_fkey(id, code, name),
        shift:shifts!department_shift_config_shift_id_fkey(*)
      `)
      .order('department_id')

    if (error) throw error
    return data || []
  },

  // ── Cập nhật config cho 1 phòng ban (xóa cũ, thêm mới) ──
  async updateDepartmentConfig(
    departmentId: string, 
    shiftConfigs: { shift_id: string; is_default: boolean }[]
  ): Promise<void> {
    // Xóa config cũ
    const { error: deleteError } = await supabase
      .from('department_shift_config')
      .delete()
      .eq('department_id', departmentId)

    if (deleteError) throw deleteError

    // Thêm config mới
    if (shiftConfigs.length > 0) {
      const rows = shiftConfigs.map(c => ({
        department_id: departmentId,
        shift_id: c.shift_id,
        is_default: c.is_default
      }))

      const { error: insertError } = await supabase
        .from('department_shift_config')
        .insert(rows)

      if (insertError) throw insertError
    }
  },

  // ── Kiểm tra phòng ban có phân ca không ──
  async departmentHasShifts(departmentId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('department_shift_config')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)

    if (error) throw error
    return (count || 0) > 0
  }
}

export default shiftService