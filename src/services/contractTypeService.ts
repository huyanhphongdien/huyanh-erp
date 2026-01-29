import { supabase } from '../lib/supabase'

// Define types inline
interface ContractType {
  id: string
  code: string
  name: string
  description?: string
  duration_months?: number
  is_renewable?: boolean
  status: string
  created_at: string
  updated_at: string
}

interface ContractTypeFormData {
  code: string
  name: string
  description?: string
  duration_months?: number
  is_renewable?: boolean
  status?: string
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
 
export const contractTypeService = {
  async getAll(params: PaginationParams): Promise<PaginatedResponse<ContractType>> {
    const { page, pageSize, search, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
 
    let query = supabase
      .from('contract_types')
      .select('*', { count: 'exact' })
 
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
 
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
    }
 
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
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
 
  async getAllActive(): Promise<ContractType[]> {
    const { data, error } = await supabase
      .from('contract_types')
      .select('*')
      .eq('status', 'active')
      .order('name')
 
    if (error) throw error
    return data || []
  },
 
  async getById(id: string): Promise<ContractType | null> {
    const { data, error } = await supabase
      .from('contract_types')
      .select('*')
      .eq('id', id)
      .single()
 
    if (error) throw error
    return data
  },
 
  async create(contractType: ContractTypeFormData): Promise<ContractType> {
    const { data, error } = await supabase
      .from('contract_types')
      .insert(contractType)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async update(id: string, contractType: Partial<ContractTypeFormData>): Promise<ContractType> {
    const { data, error } = await supabase
      .from('contract_types')
      .update(contractType)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contract_types')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  }
}

export default contractTypeService