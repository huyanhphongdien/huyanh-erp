import { supabase } from '../lib/supabase'
import type { EmployeeProfile, EmployeeProfileFormData } from '../types'
 
export const employeeProfileService = {
  // Lấy profile theo employee_id
  async getByEmployeeId(employeeId: string): Promise<EmployeeProfile | null> {
    const { data, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('employee_id', employeeId)
      .single()
 
    if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
    return data
  },
 
  // Tạo hoặc cập nhật profile (upsert)
  async upsert(profile: EmployeeProfileFormData): Promise<EmployeeProfile> {
    const { data, error } = await supabase
      .from('employee_profiles')
      .upsert(profile, { onConflict: 'employee_id' })
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Cập nhật một phần profile
  async updatePartial(employeeId: string, updates: Partial<EmployeeProfileFormData>): Promise<EmployeeProfile> {
    const { data, error } = await supabase
      .from('employee_profiles')
      .update(updates)
      .eq('employee_id', employeeId)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  // Xóa profile
  async delete(employeeId: string): Promise<void> {
    const { error } = await supabase
      .from('employee_profiles')
      .delete()
      .eq('employee_id', employeeId)
 
    if (error) throw error
  }
}
