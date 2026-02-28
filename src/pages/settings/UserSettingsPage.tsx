// ============================================================================
// USER SETTINGS PAGE (RESPONSIVE)
// File: src/pages/UserSettingsPage.tsx
// Huy Anh ERP System - Phase 1: Đổi mật khẩu + Profile cơ bản
// ============================================================================

import React, { useState, useEffect } from 'react'
import { 
  Settings, 
  User, 
  Lock, 
  Bell, 
  Palette, 
  Shield,
  Clock,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { 
  userSettingsService, 
  type UserProfile 
} from '../../services/userSettingsService'
import { ChangePasswordForm } from '../../features/user-settings/components/ChangePasswordForm'
import { ProfileEditor } from '../../features/user-settings/components/ProfileEditor'

// ============================================================================
// TYPES
// ============================================================================

type TabId = 'profile' | 'security' | 'notifications' | 'appearance'

interface Tab {
  id: TabId
  label: string
  shortLabel: string
  icon: React.ReactNode
  disabled?: boolean
  badge?: string
}

// ============================================================================
// TABS CONFIG
// ============================================================================

const TABS: Tab[] = [
  { 
    id: 'profile', 
    label: 'Hồ sơ cá nhân',
    shortLabel: 'Hồ sơ',
    icon: <User className="w-4 h-4 sm:w-5 sm:h-5" /> 
  },
  { 
    id: 'security', 
    label: 'Bảo mật',
    shortLabel: 'Bảo mật',
    icon: <Lock className="w-4 h-4 sm:w-5 sm:h-5" /> 
  },
  { 
    id: 'notifications', 
    label: 'Thông báo',
    shortLabel: 'Thông báo',
    icon: <Bell className="w-4 h-4 sm:w-5 sm:h-5" />,
    disabled: true,
    badge: 'Sắp ra mắt'
  },
  { 
    id: 'appearance', 
    label: 'Giao diện',
    shortLabel: 'Giao diện',
    icon: <Palette className="w-4 h-4 sm:w-5 sm:h-5" />,
    disabled: true,
    badge: 'Sắp ra mắt'
  },
]

// ============================================================================
// COMPONENT
// ============================================================================

export function UserSettingsPage() {
  // State
  const [activeTab, setActiveTab] = useState<TabId>('profile')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [passwordExpiry, setPasswordExpiry] = useState<{
    isExpired: boolean
    daysSinceChange: number | null
    message?: string
  } | null>(null)
  
  // ========================================================================
  // DATA LOADING
  // ========================================================================
  
  const loadProfile = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { data, error: profileError } = await userSettingsService.getCurrentUserProfile()
      
      if (profileError) {
        setError(profileError.message)
        return
      }
      
      setProfile(data)
      
      // Check password expiry
      if (data?.employee_id) {
        const expiryResult = await userSettingsService.checkPasswordExpiry(data.employee_id)
        setPasswordExpiry(expiryResult)
      }
    } catch (err) {
      setError('Không thể tải thông tin. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    loadProfile()
  }, [])
  
  // ========================================================================
  // RENDER - Loading
  // ========================================================================
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-blue-600 mx-auto mb-3 sm:mb-4" />
          <p className="text-gray-500 text-sm sm:text-base">Đang tải thông tin...</p>
        </div>
      </div>
    )
  }
  
  // ========================================================================
  // RENDER - Error
  // ========================================================================
  
  if (error && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-red-600" />
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Có lỗi xảy ra</h2>
          <p className="text-gray-500 mb-4 text-sm sm:text-base">{error}</p>
          <button
            onClick={loadProfile}
            className="px-5 sm:px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }
  
  // ========================================================================
  // RENDER - Main
  // ========================================================================
  
  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-6 md:py-8">
      {/* Header */}
      <div className="mb-4 sm:mb-6 md:mb-8">
        <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2">
          <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
            <Settings className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Cài đặt tài khoản</h1>
        </div>
        <p className="text-gray-500 text-xs sm:text-sm md:text-base">
          Quản lý thông tin cá nhân và cài đặt bảo mật
        </p>
      </div>
      
      {/* Password Expiry Warning */}
      {passwordExpiry?.isExpired && (
        <div className="mb-4 sm:mb-6 flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800 text-sm sm:text-base">{passwordExpiry.message}</p>
            <button
              onClick={() => setActiveTab('security')}
              className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-amber-700 hover:text-amber-900 font-medium underline"
            >
              Đổi mật khẩu ngay →
            </button>
          </div>
        </div>
      )}
      
      {/* Last Password Change Info */}
      {profile?.last_password_change && passwordExpiry && passwordExpiry.daysSinceChange !== null && !passwordExpiry.isExpired && (
        <div className="mb-4 sm:mb-6 flex items-center gap-2 text-xs sm:text-sm text-gray-500">
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
          <span>
            Lần đổi mật khẩu cuối: {new Date(profile.last_password_change).toLocaleDateString('vi-VN')} 
            ({passwordExpiry.daysSinceChange} ngày trước)
          </span>
        </div>
      )}
      
      {/* Main Layout */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
        {/* Mobile Tabs - Horizontal scrollable */}
        <div className="lg:hidden">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors flex-shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-blue-100 text-blue-700'
                    : tab.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span>{tab.shortLabel}</span>
                {tab.badge && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded-full">
                    Soon
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Sidebar - Tabs */}
        <div className="hidden lg:block lg:w-64 flex-shrink-0">
          <nav className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600'
                    : tab.disabled
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                }`}
              >
                <span className={activeTab === tab.id ? 'text-blue-600' : ''}>
                  {tab.icon}
                </span>
                <span className="font-medium">{tab.label}</span>
                {tab.badge && (
                  <span className="ml-auto px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          {/* Security Tips - Desktop only */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-blue-600" />
              <h4 className="font-medium text-blue-900">Mẹo bảo mật</h4>
            </div>
            <ul className="text-sm text-blue-700 space-y-1.5">
              <li>• Đổi mật khẩu định kỳ 90 ngày</li>
              <li>• Không chia sẻ mật khẩu với ai</li>
              <li>• Sử dụng mật khẩu mạnh</li>
              <li>• Đăng xuất khi rời máy tính</li>
            </ul>
          </div>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <ProfileEditor 
              profile={profile} 
              onProfileUpdate={loadProfile}
            />
          )}
          
          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-4 sm:space-y-6">
              <ChangePasswordForm />
              
              {/* Additional Security Info */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
                  Thông tin bảo mật
                </h3>
                
                <div className="space-y-3 sm:space-y-4">
                  {/* Last Password Change */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 sm:py-3 border-b border-gray-100 gap-1 sm:gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">Lần đổi mật khẩu cuối</p>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {profile?.last_password_change 
                          ? new Date(profile.last_password_change).toLocaleString('vi-VN')
                          : 'Chưa có thông tin'
                        }
                      </p>
                    </div>
                    {passwordExpiry && passwordExpiry.daysSinceChange !== null && (
                      <span className={`self-start sm:self-auto px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs sm:text-sm flex-shrink-0 ${
                        (passwordExpiry.daysSinceChange || 0) > 60
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {passwordExpiry.daysSinceChange} ngày trước
                      </span>
                    )}
                  </div>
                  
                  {/* 2FA Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 sm:py-3 border-b border-gray-100 gap-1 sm:gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">Xác thực 2 yếu tố (2FA)</p>
                      <p className="text-xs sm:text-sm text-gray-500">
                        Bảo vệ tài khoản với mã xác thực bổ sung
                      </p>
                    </div>
                    <span className="self-start sm:self-auto px-2 sm:px-3 py-0.5 sm:py-1 bg-gray-100 text-gray-500 rounded-full text-xs sm:text-sm flex-shrink-0">
                      Sắp ra mắt
                    </span>
                  </div>
                  
                  {/* Active Sessions */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 sm:py-3 gap-1 sm:gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm sm:text-base">Phiên đăng nhập</p>
                      <p className="text-xs sm:text-sm text-gray-500">
                        Quản lý các thiết bị đã đăng nhập
                      </p>
                    </div>
                    <span className="self-start sm:self-auto px-2 sm:px-3 py-0.5 sm:py-1 bg-gray-100 text-gray-500 rounded-full text-xs sm:text-sm flex-shrink-0">
                      Sắp ra mắt
                    </span>
                  </div>
                </div>
              </div>

              {/* Mobile Security Tips */}
              <div className="lg:hidden p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  <h4 className="font-medium text-blue-900 text-sm sm:text-base">Mẹo bảo mật</h4>
                </div>
                <ul className="text-xs sm:text-sm text-blue-700 space-y-1">
                  <li>• Đổi mật khẩu định kỳ 90 ngày</li>
                  <li>• Không chia sẻ mật khẩu với ai</li>
                  <li>• Sử dụng mật khẩu mạnh</li>
                  <li>• Đăng xuất khi rời máy tính</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* Notifications Tab (Placeholder) */}
          {activeTab === 'notifications' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 text-center">
              <Bell className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1.5 sm:mb-2">
                Cài đặt thông báo
              </h3>
              <p className="text-gray-500 text-sm sm:text-base">
                Tính năng này đang được phát triển và sẽ sớm ra mắt.
              </p>
            </div>
          )}
          
          {/* Appearance Tab (Placeholder) */}
          {activeTab === 'appearance' && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8 text-center">
              <Palette className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1.5 sm:mb-2">
                Cài đặt giao diện
              </h3>
              <p className="text-gray-500 text-sm sm:text-base">
                Tính năng này đang được phát triển và sẽ sớm ra mắt.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserSettingsPage