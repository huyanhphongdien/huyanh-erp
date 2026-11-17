// ============================================================================
// PROFILE EDITOR
// File: src/features/user-settings/components/ProfileEditor.tsx
// Huy Anh ERP System
// ============================================================================

import React, { useState, useEffect } from 'react'
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Building2, 
  Briefcase,
  CreditCard,
  AlertCircle,
  Heart,
  Save,
  Loader2,
  Check,
  Camera,
  Trash2
} from 'lucide-react'
import { App } from 'antd'
import {
  userSettingsService,
  type UserProfile,
  type UpdateProfileInput
} from '../../../services/userSettingsService'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'

// ============================================================================
// TYPES
// ============================================================================

interface ProfileEditorProps {
  profile: UserProfile | null
  onProfileUpdate?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ProfileEditor({ profile, onProfileUpdate }: ProfileEditorProps) {
  const { modal } = App.useApp()
  // Form state
  const [formData, setFormData] = useState<UpdateProfileInput>({
    phone: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    bank_account_number: '',
    bank_name: ''
  })
  
  // UI state
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  
  // ========================================================================
  // EFFECTS
  // ========================================================================
  
  useEffect(() => {
    if (profile) {
      setFormData({
        phone: profile.phone || '',
        address: profile.address || '',
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
        emergency_contact_relation: profile.emergency_contact_relation || '',
        bank_account_number: profile.bank_account_number || '',
        bank_name: profile.bank_name || ''
      })
    }
  }, [profile])
  
  // ========================================================================
  // HANDLERS
  // ========================================================================
  
  const handleChange = (field: keyof UpdateProfileInput, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
    setSuccess(false)
  }
  
  const handleSave = async () => {
    if (!profile?.employee_id) return
    
    setIsSaving(true)
    setError(null)
    
    try {
      const result = await userSettingsService.updateProfile(profile.employee_id, formData)
      
      if (result.success) {
        setSuccess(true)
        setIsEditing(false)
        onProfileUpdate?.()
        
        // Auto hide success after 3s
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(dichLoiHeThong(result.error, 'Lưu thất bại'))
      }
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }
  
  const handleCancel = () => {
    // Reset to original values
    if (profile) {
      setFormData({
        phone: profile.phone || '',
        address: profile.address || '',
        emergency_contact_name: profile.emergency_contact_name || '',
        emergency_contact_phone: profile.emergency_contact_phone || '',
        emergency_contact_relation: profile.emergency_contact_relation || '',
        bank_account_number: profile.bank_account_number || '',
        bank_name: profile.bank_name || ''
      })
    }
    setIsEditing(false)
    setError(null)
  }
  
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile?.employee_id) return
    
    setIsUploadingAvatar(true)
    setError(null)
    
    try {
      const result = await userSettingsService.uploadAvatar(profile.employee_id, file)
      
      if (result.success) {
        onProfileUpdate?.()
      } else {
        setError(dichLoiHeThong(result.error, 'Tải ảnh lên thất bại'))
      }
    } catch (err) {
      setError(dichLoiHeThong(err, 'Có lỗi khi tải ảnh lên'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const doRemoveAvatar = async () => {
    if (!profile?.employee_id) return
    setIsUploadingAvatar(true)
    setError(null)
    try {
      const result = await userSettingsService.removeAvatar(profile.employee_id)
      if (result.success) {
        onProfileUpdate?.()
      } else {
        // trước đây lỗi xoá ảnh không báo gì — người dùng tưởng đã xoá
        setError(dichLoiHeThong(result.error, 'Xoá ảnh đại diện thất bại'))
      }
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Xác nhận bằng Modal antd (thay window.confirm — hộp hệ thống tiêu đề tiếng Anh, chặn luồng, thô trên điện thoại)
  const handleRemoveAvatar = () => {
    if (!profile?.employee_id) return
    modal.confirm({
      title: 'Xoá ảnh đại diện?',
      content: 'Ảnh hiện tại sẽ bị gỡ khỏi hồ sơ nhân viên. Muốn có ảnh lại thì tải ảnh mới lên.',
      okText: 'Xoá ảnh',
      okButtonProps: { danger: true },
      cancelText: 'Thôi',
      onOk: doRemoveAvatar,
    })
  }
  
  // ========================================================================
  // RENDER
  // ========================================================================
  
  if (!profile) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-3" />
        <p className="text-gray-500">Đang tải thông tin...</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      {/* Success message */}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <Check className="w-5 h-5 text-green-600" />
          <p className="text-green-800">Đã lưu thay đổi thành công!</p>
        </div>
      )}
      
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <p className="text-red-800">{error}</p>
        </div>
      )}
      
      {/* Profile Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header with Avatar */}
        <div className="bg-gradient-to-r from-primary to-secondary px-6 py-8">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-white shadow-lg overflow-hidden">
                {profile.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                    <span className="text-3xl font-bold text-primary">
                      {profile.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Avatar actions */}
              <div className="absolute -bottom-1 -right-1 flex gap-1">
                <label className="p-1.5 bg-white rounded-full shadow cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                    disabled={isUploadingAvatar}
                  />
                  {isUploadingAvatar ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-gray-600" />
                  )}
                </label>
                
                {profile.avatar_url && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="p-1.5 bg-white rounded-full shadow hover:bg-red-50 transition-colors"
                    title="Xóa ảnh"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
            </div>
            
            {/* Basic Info (Read-only) */}
            <div className="text-white">
              <h2 className="text-2xl font-bold">{profile.full_name}</h2>
              <p className="text-white/80 mt-1">Mã NV: {profile.employee_code}</p>
              <div className="flex items-center gap-4 mt-2 text-white/80">
                {profile.department_name && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" />
                    {profile.department_name}
                  </span>
                )}
                {profile.position_name && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4" />
                    {profile.position_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {/* Edit Toggle */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Thông tin cá nhân</h3>
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
              >
                Chỉnh sửa
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-secondary rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Lưu
                </button>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Email (Read-only) */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                <Mail className="w-4 h-4 inline mr-1.5" />
                Email
              </label>
              <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                {profile.email}
                <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                  Đã xác minh
                </span>
              </div>
            </div>
            
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                <Phone className="w-4 h-4 inline mr-1.5" />
                Số điện thoại
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Nhập số điện thoại"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.phone || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
            
            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                <MapPin className="w-4 h-4 inline mr-1.5" />
                Địa chỉ
              </label>
              {isEditing ? (
                <textarea
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary resize-none"
                  placeholder="Nhập địa chỉ"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.address || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Emergency Contact */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Heart className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Liên hệ khẩn cấp</h3>
              <p className="text-sm text-gray-500">
                Thông tin người thân để liên hệ khi cần thiết
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Họ tên
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Họ tên người liên hệ"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.emergency_contact_name || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
            
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Số điện thoại
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Số điện thoại"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.emergency_contact_phone || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
            
            {/* Relation */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Mối quan hệ
              </label>
              {isEditing ? (
                <select
                  value={formData.emergency_contact_relation}
                  onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                >
                  <option value="">-- Chọn --</option>
                  <option value="Bố">Bố</option>
                  <option value="Mẹ">Mẹ</option>
                  <option value="Vợ">Vợ</option>
                  <option value="Chồng">Chồng</option>
                  <option value="Con">Con</option>
                  <option value="Anh/Chị/Em">Anh/Chị/Em</option>
                  <option value="Bạn bè">Bạn bè</option>
                  <option value="Khác">Khác</option>
                </select>
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.emergency_contact_relation || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Bank Info */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CreditCard className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Thông tin ngân hàng</h3>
              <p className="text-sm text-gray-500">
                Dùng để nhận lương và các khoản thanh toán
              </p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bank Name */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Ngân hàng
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.bank_name}
                  onChange={(e) => handleChange('bank_name', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Ví dụ: Vietcombank, BIDV..."
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.bank_name || <span className="text-gray-400 italic">Chưa cập nhật</span>}
                </div>
              )}
            </div>
            
            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">
                Số tài khoản
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={formData.bank_account_number}
                  onChange={(e) => handleChange('bank_account_number', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Nhập số tài khoản"
                />
              ) : (
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700">
                  {profile.bank_account_number ? (
                    // Ẩn một phần số tài khoản
                    `****${profile.bank_account_number.slice(-4)}`
                  ) : (
                    <span className="text-gray-400 italic">Chưa cập nhật</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileEditor