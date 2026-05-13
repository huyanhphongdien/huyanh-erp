// ============================================================================
// USER SAVED VIEWS SERVICE
// File: src/services/userSavedViewsService.ts
//
// CRUD cho user_saved_views table — lưu filter + column + sort cho từng user
// trên từng module. RLS đảm bảo user chỉ thấy view của mình.
// ============================================================================

import { supabase } from '../lib/supabase'

export interface SavedView {
  id: string
  user_id: string
  module: string
  name: string
  is_default: boolean
  filters: Record<string, any>
  columns: Record<string, any>
  sort: Record<string, any>
  density: 'compact' | 'normal' | 'comfortable'
  created_at: string
  updated_at: string
}

export interface CreateSavedViewInput {
  module: string
  name: string
  filters: Record<string, any>
  columns: Record<string, any>
  sort: Record<string, any>
  density: string
}

export const userSavedViewsService = {
  async list(module: string): Promise<SavedView[]> {
    const { data, error } = await supabase
      .from('user_saved_views')
      .select('*')
      .eq('module', module)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data || []
  },

  async create(input: CreateSavedViewInput): Promise<SavedView> {
    // Get current user's employee_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Chưa login')
    // Cột link auth trong bảng employees là `user_id` (KHÔNG phải auth_user_id)
    const { data: emp } = await supabase
      .from('employees').select('id').eq('user_id', user.id).single()
    if (!emp) throw new Error('Không tìm thấy employee record')

    const { data, error } = await supabase
      .from('user_saved_views')
      .insert({ ...input, user_id: emp.id })
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async update(id: string, patch: Partial<CreateSavedViewInput>): Promise<SavedView> {
    const { data, error } = await supabase
      .from('user_saved_views')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('user_saved_views').delete().eq('id', id)
    if (error) throw error
  },
}
