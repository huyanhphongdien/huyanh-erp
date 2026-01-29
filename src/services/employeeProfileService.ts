import { supabase } from '../lib/supabase'

// Define types inline
interface EmployeeProfile {
  id: string
  employee_id: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  bank_account_number?: string
  bank_name?: string
  tax_code?: string
  insurance_number?: string
  education_level?: string
  degree?: string
  major?: string
  university?: string
  graduation_year?: number
  certifications?: string
  skills?: string
  previous_companies?: string
  notes?: string
  created_at: string
  updated_at: string
}

interface EmployeeProfileFormData {
  employee_id: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  bank_account_number?: string
  bank_name?: string
  tax_code?: string
  insurance_number?: string
  education_level?: string
  degree?: string
  major?: string
  university?: string
  graduation_year?: number
  certifications?: string
  skills?: string
  previous_companies?: string
  notes?: string
}
 
export const employeeProfileService = {
  // Lấy profile theo employee_id
  async getByEmployeeId(employeeId: string): Promise<EmployeeProfile | null> {
    const { data, error } = await supabase
      .from('employee_profiles')
      .select('*')
      .eq('employee_id', employeeId)
      .maybeSingle()  // FIXED: Dùng maybeSingle thay vì single
 
    if (error) throw error
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

export default employeeProfileService