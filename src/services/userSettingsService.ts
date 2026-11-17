// ============================================================================
// USER SETTINGS SERVICE
// File: src/services/userSettingsService.ts
// Huy Anh ERP System - Phase 1: Đổi mật khẩu + Profile cơ bản
// ============================================================================

import { supabase } from '../lib/supabase'
import { dichLoiAuth } from '../utils/dichLoiAuth'
import { dichLoiHeThong } from '../utils/dichLoiHeThong'

// ============================================================================
// TYPES
// ============================================================================

export interface UserProfile {
  id: string
  employee_id: string
  user_id: string // auth.users.id
  
  // Thông tin cơ bản (chỉ xem)
  full_name: string
  email: string
  employee_code: string
  department_name?: string
  position_name?: string
  avatar_url?: string
  
  // Thông tin có thể chỉnh sửa
  phone?: string
  address?: string
  
  // Liên hệ khẩn cấp
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  
  // Thông tin ngân hàng
  bank_account_number?: string
  bank_name?: string
  
  // Metadata
  last_password_change?: string
  created_at: string
  updated_at: string
}

export interface UpdateProfileInput {
  phone?: string
  address?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  bank_account_number?: string
  bank_name?: string
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export interface ChangePasswordResult {
  success: boolean
  error?: string
  message?: string
}

export interface PasswordValidationResult {
  isValid: boolean
  errors: string[]
}

export interface AvatarUploadResult {
  success: boolean
  url?: string
  error?: string
}

// ============================================================================
// PASSWORD VALIDATION
// ============================================================================

/**
 * Validate password strength
 * Yêu cầu:
 * - Tối thiểu 8 ký tự
 * - Ít nhất 1 chữ hoa
 * - Ít nhất 1 chữ thường
 * - Ít nhất 1 số
 * - Ít nhất 1 ký tự đặc biệt
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ hoa')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 chữ thường')
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 số')
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Mật khẩu phải có ít nhất 1 ký tự đặc biệt (!@#$%^&*...)')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

/**
 * Validate change password input
 */
export function validateChangePasswordInput(input: ChangePasswordInput): PasswordValidationResult {
  const errors: string[] = []
  
  // Check empty fields
  if (!input.currentPassword) {
    errors.push('Vui lòng nhập mật khẩu hiện tại')
  }
  
  if (!input.newPassword) {
    errors.push('Vui lòng nhập mật khẩu mới')
  }
  
  if (!input.confirmPassword) {
    errors.push('Vui lòng xác nhận mật khẩu mới')
  }
  
  // Check password match
  if (input.newPassword !== input.confirmPassword) {
    errors.push('Mật khẩu xác nhận không khớp')
  }
  
  // Check new password is different from current
  if (input.currentPassword === input.newPassword) {
    errors.push('Mật khẩu mới phải khác mật khẩu hiện tại')
  }
  
  // Validate password strength
  if (input.newPassword) {
    const strengthResult = validatePasswordStrength(input.newPassword)
    if (!strengthResult.isValid) {
      errors.push(...strengthResult.errors)
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const userSettingsService = {
  // ========================================================================
  // PROFILE
  // ========================================================================
  
  /**
   * Lấy thông tin profile đầy đủ của user hiện tại
   */
  async getCurrentUserProfile(): Promise<{ data: UserProfile | null; error: Error | null }> {
    try {
      // 1. Lấy user đang đăng nhập
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return { data: null, error: new Error('Chưa đăng nhập') }
      }
      
      // 2. Lấy thông tin employee liên kết với user
      // NOTE: Chỉ định rõ foreign key để tránh lỗi "more than one relationship"
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select(`
          id,
          code,
          full_name,
          email,
          phone,
          address,
          avatar_url,
          created_at,
          updated_at,
          department_id,
          position_id
        `)
        .eq('user_id', user.id)
        .maybeSingle()
      
      if (empError) throw empError
      
      if (!employee) {
        return { data: null, error: new Error('Không tìm thấy thông tin nhân viên') }
      }
      
      // 2b. Lấy thông tin department riêng (nếu có)
      let departmentName: string | undefined
      if (employee.department_id) {
        const { data: dept } = await supabase
          .from('departments')
          .select('id, name')
          .eq('id', employee.department_id)
          .maybeSingle()
        departmentName = dept?.name
      }
      
      // 2c. Lấy thông tin position riêng (nếu có)
      let positionName: string | undefined
      if (employee.position_id) {
        const { data: pos } = await supabase
          .from('positions')
          .select('id, name')
          .eq('id', employee.position_id)
          .maybeSingle()
        positionName = pos?.name
      }
      
      // 3. Lấy thông tin profile mở rộng
      const { data: profile, error: profileError } = await supabase
        .from('employee_profiles')
        .select('*')
        .eq('employee_id', employee.id)
        .maybeSingle()
      
      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError
      }
      
      // 4. Lấy thời gian đổi mật khẩu cuối
      const { data: securityData } = await supabase
        .from('user_security_settings')
        .select('last_password_change')
        .eq('employee_id', employee.id)
        .maybeSingle()
      
      // 5. Combine data
      // Cast employee to any để truy cập created_at, updated_at
      const emp = employee as any
      
      const userProfile: UserProfile = {
        id: profile?.id || '',
        employee_id: employee.id,
        user_id: user.id,
        full_name: employee.full_name,
        email: employee.email,
        employee_code: employee.code,
        department_name: departmentName,
        position_name: positionName,
        avatar_url: employee.avatar_url,
        phone: employee.phone,
        address: employee.address,
        emergency_contact_name: profile?.emergency_contact_name,
        emergency_contact_phone: profile?.emergency_contact_phone,
        emergency_contact_relation: profile?.emergency_contact_relation,
        bank_account_number: profile?.bank_account_number,
        bank_name: profile?.bank_name,
        last_password_change: securityData?.last_password_change,
        created_at: profile?.created_at || emp.created_at || '',
        updated_at: profile?.updated_at || emp.updated_at || ''
      }
      
      return { data: userProfile, error: null }
    } catch (error) {
      console.error('❌ [userSettingsService] getCurrentUserProfile error:', error)
      return { data: null, error: error as Error }
    }
  },
  
  /**
   * Cập nhật thông tin profile
   */
  async updateProfile(
    employeeId: string, 
    updates: UpdateProfileInput
  ): Promise<{ success: boolean; error: Error | null }> {
    try {
      console.log('📝 [userSettingsService] updateProfile:', { employeeId, updates })
      
      // 1. Cập nhật thông tin cơ bản trong employees
      const employeeUpdates: Record<string, any> = {}
      if (updates.phone !== undefined) employeeUpdates.phone = updates.phone
      if (updates.address !== undefined) employeeUpdates.address = updates.address
      
      if (Object.keys(employeeUpdates).length > 0) {
        employeeUpdates.updated_at = new Date().toISOString()
        
        const { error: empError } = await supabase
          .from('employees')
          .update(employeeUpdates)
          .eq('id', employeeId)
        
        if (empError) throw empError
      }
      
      // 2. Cập nhật thông tin mở rộng trong employee_profiles
      const profileUpdates: Record<string, any> = {}
      if (updates.emergency_contact_name !== undefined) 
        profileUpdates.emergency_contact_name = updates.emergency_contact_name
      if (updates.emergency_contact_phone !== undefined) 
        profileUpdates.emergency_contact_phone = updates.emergency_contact_phone
      if (updates.emergency_contact_relation !== undefined) 
        profileUpdates.emergency_contact_relation = updates.emergency_contact_relation
      if (updates.bank_account_number !== undefined) 
        profileUpdates.bank_account_number = updates.bank_account_number
      if (updates.bank_name !== undefined) 
        profileUpdates.bank_name = updates.bank_name
      
      if (Object.keys(profileUpdates).length > 0) {
        profileUpdates.employee_id = employeeId
        profileUpdates.updated_at = new Date().toISOString()
        
        const { error: profileError } = await supabase
          .from('employee_profiles')
          .upsert(profileUpdates, { onConflict: 'employee_id' })
        
        if (profileError) throw profileError
      }
      
      console.log('✅ [userSettingsService] Profile updated successfully')
      return { success: true, error: null }
    } catch (error) {
      console.error('❌ [userSettingsService] updateProfile error:', error)
      return { success: false, error: error as Error }
    }
  },
  
  // ========================================================================
  // AVATAR
  // ========================================================================
  
  /**
   * Upload avatar mới
   */
  async uploadAvatar(
    employeeId: string, 
    file: File
  ): Promise<AvatarUploadResult> {
    try {
      console.log('📤 [userSettingsService] uploadAvatar:', { employeeId, fileName: file.name })
      
      // 1. Validate file
      const maxSize = 2 * 1024 * 1024 // 2MB
      if (file.size > maxSize) {
        return { success: false, error: 'Ảnh không được vượt quá 2MB' }
      }
      
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        return { success: false, error: 'Chỉ chấp nhận file JPG, PNG hoặc WebP' }
      }
      
      // 2. Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${employeeId}-${Date.now()}.${fileExt}`
      const filePath = `avatars/${fileName}`
      
      // 3. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('employee-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (uploadError) throw uploadError
      
      // 4. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('employee-files')
        .getPublicUrl(filePath)
      
      // 5. Update employee record
      const { error: updateError } = await supabase
        .from('employees')
        .update({ 
          avatar_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', employeeId)
      
      if (updateError) throw updateError
      
      console.log('✅ [userSettingsService] Avatar uploaded:', publicUrl)
      return { success: true, url: publicUrl }
    } catch (error) {
      console.error('❌ [userSettingsService] uploadAvatar error:', error)
      return { success: false, error: (error as Error).message }
    }
  },
  
  /**
   * Xóa avatar (set về default)
   */
  async removeAvatar(employeeId: string): Promise<{ success: boolean; error: Error | null }> {
    try {
      const { error } = await supabase
        .from('employees')
        .update({ 
          avatar_url: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', employeeId)
      
      if (error) throw error
      
      console.log('✅ [userSettingsService] Avatar removed')
      return { success: true, error: null }
    } catch (error) {
      console.error('❌ [userSettingsService] removeAvatar error:', error)
      return { success: false, error: error as Error }
    }
  },
  
  // ========================================================================
  // PASSWORD
  // ========================================================================
  
  /**
   * Đổi mật khẩu
   */
  async changePassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
    try {
      console.log('🔐 [userSettingsService] changePassword')
      
      // 1. Validate input
      const validation = validateChangePasswordInput(input)
      if (!validation.isValid) {
        return { 
          success: false, 
          error: validation.errors.join('. ')
        }
      }
      
      // 2. Verify current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        return { success: false, error: 'Không tìm thấy thông tin tài khoản — đăng nhập lại rồi thử lại' }
      }
      
      // Try to sign in with current password to verify
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: input.currentPassword
      })
      
      if (signInError) {
        return { success: false, error: 'Mật khẩu hiện tại không đúng' }
      }
      
      // 3. Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: input.newPassword
      })
      
      if (updateError) {
        console.error('Password update error:', updateError)
        // Nói rõ lý do (vd "mật khẩu mới phải khác mật khẩu cũ") thay vì câu chung chung
        return { success: false, error: dichLoiAuth(updateError, 'Không thể cập nhật mật khẩu. Vui lòng thử lại.') }
      }
      
      // 4. Update last_password_change in security settings
      const { data: employee } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .single()
      
      if (employee) {
        await supabase
          .from('user_security_settings')
          .upsert({
            employee_id: employee.id,
            last_password_change: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'employee_id' })
      }
      
      console.log('✅ [userSettingsService] Password changed successfully')
      return { 
        success: true, 
        message: 'Đổi mật khẩu thành công!' 
      }
    } catch (error) {
      console.error('❌ [userSettingsService] changePassword error:', error)
      return {
        success: false,
        error: dichLoiHeThong(error, 'Có lỗi xảy ra. Vui lòng thử lại.')
      }
    }
  },
  
  /**
   * Kiểm tra xem user có cần đổi mật khẩu không
   * (Ví dụ: mật khẩu quá 90 ngày)
   */
  async checkPasswordExpiry(employeeId: string): Promise<{
    isExpired: boolean
    daysSinceChange: number | null
    message?: string
  }> {
    try {
      const { data } = await supabase
        .from('user_security_settings')
        .select('last_password_change, require_password_change')
        .eq('employee_id', employeeId)
        .maybeSingle()
      
      // Nếu bị yêu cầu đổi mật khẩu bắt buộc
      if (data?.require_password_change) {
        return {
          isExpired: true,
          daysSinceChange: null,
          message: 'Bạn cần đổi mật khẩu theo yêu cầu của Admin'
        }
      }
      
      // Nếu chưa có record hoặc chưa đổi mật khẩu
      if (!data?.last_password_change) {
        return {
          isExpired: false,
          daysSinceChange: null
        }
      }
      
      // Tính số ngày kể từ lần đổi cuối
      const lastChange = new Date(data.last_password_change)
      const now = new Date()
      const daysSinceChange = Math.floor(
        (now.getTime() - lastChange.getTime()) / (1000 * 60 * 60 * 24)
      )
      
      // Cảnh báo nếu > 90 ngày
      const PASSWORD_EXPIRY_DAYS = 90
      const isExpired = daysSinceChange >= PASSWORD_EXPIRY_DAYS
      
      return {
        isExpired,
        daysSinceChange,
        message: isExpired 
          ? `Mật khẩu đã quá ${PASSWORD_EXPIRY_DAYS} ngày. Khuyến nghị đổi mật khẩu mới.`
          : undefined
      }
    } catch (error) {
      console.error('❌ [userSettingsService] checkPasswordExpiry error:', error)
      return { isExpired: false, daysSinceChange: null }
    }
  }
}

export default userSettingsService