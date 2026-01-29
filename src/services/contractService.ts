import { supabase } from '../lib/supabase'

// Define types inline
interface Contract {
  id: string
  employee_id: string
  contract_type_id: string
  contract_number: string
  start_date: string
  end_date?: string
  salary?: number
  allowances?: number
  benefits?: string
  status: string
  signed_date?: string
  notes?: string
  created_at: string
  updated_at: string
}

interface ContractFormData {
  employee_id: string
  contract_type_id: string
  contract_number: string
  start_date: string
  end_date?: string
  salary?: number
  allowances?: number
  benefits?: string
  status?: string
  signed_date?: string
  notes?: string
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

export const contractService = {
  async getAll(params: PaginationParams & { employee_id?: string }): Promise<PaginatedResponse<Contract>> {
    const { page, pageSize, search, status, employee_id } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('contracts')
      .select(`
        *,
        employee:employees!contracts_employee_id_fkey(id, code, full_name),
        contract_type:contract_types!contracts_contract_type_id_fkey(id, code, name)
      `, { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

    if (search) {
      query = query.or(`contract_number.ilike.%${search}%`)
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

  async getByEmployeeId(employeeId: string): Promise<Contract[]> {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_type:contract_types!contracts_contract_type_id_fkey(id, code, name)
      `)
      .eq('employee_id', employeeId)
      .order('start_date', { ascending: false })

    if (error) throw error
    return data || []
  },

  async getActiveContract(employeeId: string): Promise<Contract | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_type:contract_types!contracts_contract_type_id_fkey(id, code, name)
      `)
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .maybeSingle()  // FIXED: Dùng maybeSingle

    if (error) throw error
    return data
  },

  async getById(id: string): Promise<Contract | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        employee:employees!contracts_employee_id_fkey(id, code, full_name),
        contract_type:contract_types!contracts_contract_type_id_fkey(*)
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  async create(contract: ContractFormData): Promise<Contract> {
    const { data, error } = await supabase
      .from('contracts')
      .insert(contract)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, contract: Partial<ContractFormData>): Promise<Contract> {
    const { data, error } = await supabase
      .from('contracts')
      .update(contract)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // Tạo số hợp đồng tự động
  async generateContractNumber(): Promise<string> {
    const year = new Date().getFullYear()
    
    const { data, error } = await supabase
      .from('contracts')
      .select('contract_number')
      .ilike('contract_number', `HD${year}%`)
      .order('contract_number', { ascending: false })
      .limit(1)

    // Không dùng .single() vì sẽ lỗi 406 khi bảng rỗng
    // data trả về là array
    if (!error && data && data.length > 0 && data[0].contract_number) {
      const lastNumber = data[0].contract_number
      const num = parseInt(lastNumber.slice(-4)) + 1
      return `HD${year}${num.toString().padStart(4, '0')}`
    }
    
    // Nếu chưa có hợp đồng nào trong năm, bắt đầu từ 0001
    return `HD${year}0001`
  },

  async getExpiringContracts(daysAhead: number = 30): Promise<Contract[]> {
    const today = new Date()
    const futureDate = new Date()
    futureDate.setDate(today.getDate() + daysAhead)

    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        employee:employees!contracts_employee_id_fkey(id, code, full_name),
        contract_type:contract_types!contracts_contract_type_id_fkey(id, code, name)
      `)
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', futureDate.toISOString().split('T')[0])
      .order('end_date', { ascending: true })

    if (error) throw error
    return data || []
  }
}

export default contractService