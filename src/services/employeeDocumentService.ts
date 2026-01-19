import { supabase } from '../lib/supabase'
import type { EmployeeDocument, EmployeeDocumentFormData } from '../types'
 
export const employeeDocumentService = {
  // Lấy tất cả tài liệu của nhân viên
  async getByEmployeeId(employeeId: string): Promise<EmployeeDocument[]> {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
 
    if (error) throw error
    return data || []
  },
 
  // Lấy theo loại tài liệu
  async getByType(employeeId: string, documentType: string): Promise<EmployeeDocument[]> {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('document_type', documentType)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
 
    if (error) throw error
    return data || []
  },
 
  async create(document: EmployeeDocumentFormData): Promise<EmployeeDocument> {
    const { data, error } = await supabase
      .from('employee_documents')
      .insert(document)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async update(id: string, document: Partial<EmployeeDocumentFormData>): Promise<EmployeeDocument> {
    const { data, error } = await supabase
      .from('employee_documents')
      .update(document)
      .eq('id', id)
      .select()
      .single()
 
    if (error) throw error
    return data
  },
 
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', id)
 
    if (error) throw error
  },
 
  // Archive thay vì xóa
  async archive(id: string): Promise<void> {
    const { error } = await supabase
      .from('employee_documents')
      .update({ status: 'archived' })
      .eq('id', id)
 
    if (error) throw error
  },
 
  // Upload file lên Supabase Storage
  async uploadFile(file: File, employeeId: string): Promise<string> {
    const fileExt = file.name.split('.').pop()
    const fileName = `${employeeId}/${Date.now()}.${fileExt}`
    
    const { error } = await supabase.storage
      .from('employee-documents')
      .upload(fileName, file)
 
    if (error) throw error
 
    const { data } = supabase.storage
      .from('employee-documents')
      .getPublicUrl(fileName)
 
    return data.publicUrl
  }
}
