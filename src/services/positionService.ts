import { supabase } from '../lib/supabase'
import type { Position, PaginatedResponse } from '../types'

// Define PositionFormData inline
interface PositionFormData {
  code: string
  name: string
  description?: string
  department_id?: string
  level?: number
  status?: string
}

// Define PaginationParams inline
interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}
 
export const positionService = {
  // Lấy danh sách có phân trang
  async getAll(params: PaginationParams): Promise<PaginatedResponse<Position>> {
    const { page, pageSize, search, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('positions')
      .select('*', { count: 'exact' })
 
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
 
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }
 
    const { data, error, count } = await query
      .order('level', { ascending: true })
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
 
  // Lấy tất cả (cho dropdown)
  async getAllActive(): Promise<Position[]> {
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('status', 'active')
      .order('level')
 
    if (error) throw error
    return data || []
  },
 
  // Lấy theo ID
  async getById(id: string): Promise<Position | null> {
    const { data, error } = await supabase
      .from('positions')
      .select('*')
      .eq('id', id)
      .single()
 
    if (error) throw error
    return data
  },
 
  // Tạo mới
  async create(position: PositionFormData): Promise<Position> {
    const { data, error } = await supabase
      .from('positions')
      .insert(position)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Cập nhật
  async update(id: string, position: Partial<PositionFormData>): Promise<Position> {
    const { data, error } = await supabase
      .from('positions')
      .update(position)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Xóa
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('positions')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  },
 
  // Kiểm tra mã đã tồn tại
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('positions')
      .select('id', { count: 'exact', head: true })  // FIXED: Thêm head: true
      .eq('code', code)
 
    if (excludeId) {
      query = query.neq('id', excludeId)
    }
 
    const { count } = await query  // FIXED: Dùng count thay vì data
    return (count || 0) > 0
  }
}

export default positionService