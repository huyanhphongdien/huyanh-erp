// ============================================================================
// CHANGE PASSWORD FORM
// File: src/features/user-settings/components/ChangePasswordForm.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState } from 'react'
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Check, 
  X, 
  AlertCircle,
  Loader2,
  ShieldCheck
} from 'lucide-react'
import { 
  userSettingsService, 
  validatePasswordStrength,
  type ChangePasswordInput 
} from '../../../services/userSettingsService'

// ============================================================================
// TYPES
// ============================================================================

interface PasswordRequirement {
  label: string
  validator: (password: string) => boolean
}

// ============================================================================
// PASSWORD REQUIREMENTS
// ============================================================================

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'Ít nhất 8 ký tự', validator: (p) => p.length >= 8 },
  { label: 'Có chữ hoa (A-Z)', validator: (p) => /[A-Z]/.test(p) },
  { label: 'Có chữ thường (a-z)', validator: (p) => /[a-z]/.test(p) },
  { label: 'Có số (0-9)', validator: (p) => /[0-9]/.test(p) },
  { label: 'Có ký tự đặc biệt (!@#$...)', validator: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function ChangePasswordForm() {
  // Form state
  const [formData, setFormData] = useState<ChangePasswordInput>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  // UI state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  // ========================================================================
  // HANDLERS
  // ========================================================================
  
  const handleChange = (field: keyof ChangePasswordInput, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
    setSuccess(false)
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setIsSubmitting(true)
    
    try {
      const result = await userSettingsService.changePassword(formData)
      
      if (result.success) {
        setSuccess(true)
        // Clear form
        setFormData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        })
      } else {
        setError(result.error || 'Đổi mật khẩu thất bại')
      }
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // ========================================================================
  // COMPUTED
  // ========================================================================
  
  const passwordStrength = validatePasswordStrength(formData.newPassword)
  const passwordsMatch = formData.newPassword === formData.confirmPassword && formData.confirmPassword !== ''
  const canSubmit = 
    formData.currentPassword !== '' &&
    passwordStrength.isValid &&
    passwordsMatch &&
    !isSubmitting
  
  // ========================================================================
  // RENDER
  // ========================================================================
  
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Đổi mật khẩu</h3>
            <p className="text-sm text-gray-500">
              Đảm bảo tài khoản của bạn được bảo mật
            </p>
          </div>
        </div>
      </div>
      
      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Success message */}
        {success && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">Đổi mật khẩu thành công!</p>
              <p className="text-sm text-green-600">
                Mật khẩu mới đã được áp dụng cho tài khoản của bạn.
              </p>
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}
        
        {/* Current Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mật khẩu hiện tại <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              value={formData.currentPassword}
              onChange={(e) => handleChange('currentPassword', e.target.value)}
              className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Nhập mật khẩu hiện tại"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        
        {/* New Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showNewPassword ? 'text' : 'password'}
              value={formData.newPassword}
              onChange={(e) => handleChange('newPassword', e.target.value)}
              className="w-full px-4 py-2.5 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Nhập mật khẩu mới"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          
          {/* Password Requirements */}
          {formData.newPassword && (
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-2">Yêu cầu mật khẩu:</p>
              <div className="space-y-1.5">
                {PASSWORD_REQUIREMENTS.map((req, index) => {
                  const isValid = req.validator(formData.newPassword)
                  return (
                    <div 
                      key={index}
                      className={`flex items-center gap-2 text-sm ${
                        isValid ? 'text-green-600' : 'text-gray-500'
                      }`}
                    >
                      {isValid ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                      <span>{req.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        
        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Xác nhận mật khẩu mới <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className={`w-full px-4 py-2.5 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                formData.confirmPassword && !passwordsMatch 
                  ? 'border-red-300 bg-red-50' 
                  : formData.confirmPassword && passwordsMatch
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300'
              }`}
              placeholder="Nhập lại mật khẩu mới"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {formData.confirmPassword && !passwordsMatch && (
            <p className="mt-1.5 text-sm text-red-600 flex items-center gap-1">
              <X className="w-4 h-4" />
              Mật khẩu xác nhận không khớp
            </p>
          )}
          {formData.confirmPassword && passwordsMatch && (
            <p className="mt-1.5 text-sm text-green-600 flex items-center gap-1">
              <Check className="w-4 h-4" />
              Mật khẩu khớp
            </p>
          )}
        </div>
        
        {/* Submit Button */}
        <div className="pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              canSubmit
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                Đổi mật khẩu
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default ChangePasswordForm