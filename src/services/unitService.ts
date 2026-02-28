import { supabase } from '../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export interface Unit {
  id: string
  code: string
  name: string
  symbol?: string
  unit_type: 'piece' | 'weight' | 'volume' | 'length' | 'area'
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UnitFormData {
  code: string
  name: string
  symbol?: string
  unit_type?: 'piece' | 'weight' | 'volume' | 'length' | 'area'
  sort_order?: number
  is_active?: boolean
}

export interface UnitPaginationParams {
  page: number
  pageSize: number
  search?: string
  unitType?: string
  isActive?: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============================================
// UNIT TYPES CONFIG (for UI)
// ============================================

export const UNIT_TYPES = [
  { value: 'piece', label: 'Đơn vị đếm', color: 'bg-blue-100 text-blue-800' },
  { value: 'weight', label: 'Khối lượng', color: 'bg-green-100 text-green-800' },
  { value: 'volume', label: 'Thể tích', color: 'bg-purple-100 text-purple-800' },
  { value: 'length', label: 'Chiều dài', color: 'bg-orange-100 text-orange-800' },
  { value: 'area', label: 'Diện tích', color: 'bg-yellow-100 text-yellow-800' }
]

export const getUnitTypeLabel = (type: string): string => {
  const found = UNIT_TYPES.find(t => t.value === type)
  return found ? found.label : type
}

export const getUnitTypeColor = (type: string): string => {
  const found = UNIT_TYPES.find(t => t.value === type)
  return found ? found.color : 'bg-gray-100 text-gray-800'
}

// ============================================
// UNIT SERVICE
// ============================================

export const unitService = {
  // Lấy danh sách đơn vị (có phân trang)
  async getAll(params: UnitPaginationParams): Promise<PaginatedResponse<Unit>> {
    const { page = 1, pageSize = 10, search, unitType, isActive } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('units')
      .select('*', { count: 'exact' })

    // Filter by unit type
    if (unitType) {
      query = query.eq('unit_type', unitType)
    }

    // Filter by active status
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive)
    }

    // Search by code, name, or symbol
    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%,symbol.ilike.%${search}%`)
    }

    const { data, error, count } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
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

  // Lấy tất cả đơn vị active (cho dropdown)
  async getAllActive(): Promise<Unit[]> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Lấy đơn vị theo loại (cho dropdown phân nhóm)
  async getByType(unitType: string): Promise<Unit[]> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('unit_type', unitType)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error
    return data || []
  },

  // Lấy chi tiết theo ID
  async getById(id: string): Promise<Unit> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  // Lấy theo code
  async getByCode(code: string): Promise<Unit | null> {
    const { data, error } = await supabase
      .from('units')
      .select('*')
      .eq('code', code)
      .single()

    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  // Kiểm tra code đã tồn tại
  async checkCodeExists(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('units')
      .select('id')
      .eq('code', code)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query.single()

    if (error && error.code === 'PGRST116') return false
    if (error) throw error
    return !!data
  },

  // Tạo mới
  async create(formData: UnitFormData): Promise<Unit> {
    // Check duplicate code
    const exists = await this.checkCodeExists(formData.code)
    if (exists) {
      throw new Error(`Mã đơn vị "${formData.code}" đã tồn tại`)
    }

    const { data, error } = await supabase
      .from('units')
      .insert({
        ...formData,
        code: formData.code.toLowerCase().trim(),
        is_active: formData.is_active ?? true
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Cập nhật
  async update(id: string, formData: Partial<UnitFormData>): Promise<Unit> {
    // Check duplicate code if code is being updated
    if (formData.code) {
      const exists = await this.checkCodeExists(formData.code, id)
      if (exists) {
        throw new Error(`Mã đơn vị "${formData.code}" đã tồn tại`)
      }
    }

    const { data, error } = await supabase
      .from('units')
      .update({
        ...formData,
        code: formData.code ? formData.code.toLowerCase().trim() : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // Xóa (soft delete - đổi is_active = false)
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('units')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error
  },

  // Kích hoạt lại
  async activate(id: string): Promise<void> {
    const { error } = await supabase
      .from('units')
      .update({ 
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error
  },

  // Xóa vĩnh viễn (hard delete)
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('units')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') {
        throw new Error('Không thể xóa đơn vị đang được sử dụng bởi vật tư')
      }
      throw error
    }
  },

  // Cập nhật thứ tự sắp xếp
  async updateSortOrder(items: { id: string; sort_order: number }[]): Promise<void> {
    const updates = items.map(item => 
      supabase
        .from('units')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
    )

    const results = await Promise.all(updates)
    
    for (const result of results) {
      if (result.error) throw result.error
    }
  }
}

export default unitService