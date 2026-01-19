import { supabase } from '../lib/supabase'
import type { SalaryGrade, SalaryGradeFormData, PaginationParams, PaginatedResponse } from '../types'

export const salaryGradeService = {
  async getAll(params: PaginationParams): Promise<PaginatedResponse<SalaryGrade>> {
    const { page = 1, pageSize = 10, search, status } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('salary_grades')
      .select('*', { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`)

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

  async getAllActive(): Promise<SalaryGrade[]> {
    const { data, error } = await supabase
      .from('salary_grades')
      .select('*')
      .eq('status', 'active')
      .order('level', { ascending: true })

    if (error) throw error
    return data || []
  },

  async getById(id: string): Promise<SalaryGrade> {
    const { data, error } = await supabase
      .from('salary_grades')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  },

  async create(formData: SalaryGradeFormData): Promise<SalaryGrade> {
    const { data, error } = await supabase
      .from('salary_grades')
      .insert(formData)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async update(id: string, formData: Partial<SalaryGradeFormData>): Promise<SalaryGrade> {
    const { data, error } = await supabase
      .from('salary_grades')
      .update({ ...formData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('salary_grades')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}