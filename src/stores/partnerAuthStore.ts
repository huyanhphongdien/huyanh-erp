// ============================================================================
// FILE: src/stores/partnerAuthStore.ts
// MODULE: B2B Partner Portal — Auth Store
// DESCRIPTION: Zustand store quản lý auth state cho Partner Portal
// ============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface Partner {
  id: string
  code: string
  name: string
  partner_type: 'dealer' | 'supplier' | 'processor'
  phone?: string
  email?: string
  address?: string
  tier: 'new' | 'bronze' | 'silver' | 'gold' | 'diamond'
  status: 'active' | 'inactive' | 'suspended'
  total_volume_12m?: number
  rating?: number
  is_b2b_active: boolean
  created_at: string
}

export interface PartnerUser {
  id: string
  partner_id: string
  auth_user_id: string
  full_name: string
  phone: string
  email?: string
  position?: string
  role: 'owner' | 'admin' | 'staff' | 'supervisor'
  is_active: boolean
  created_at: string
  updated_at?: string
}

interface PartnerAuthState {
  // State
  partner: Partner | null
  partnerUser: PartnerUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  // Actions
  checkAuth: () => Promise<void>
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  setPartner: (partner: Partner | null) => void
  setPartnerUser: (user: PartnerUser | null) => void
  clearError: () => void
}

// ============================================================================
// STORE
// ============================================================================

export const usePartnerAuthStore = create<PartnerAuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      partner: null,
      partnerUser: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,

      // Check authentication on app load
      checkAuth: async () => {
        set({ isLoading: true, error: null })

        try {
          // Get current Supabase auth user
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          
          if (authError || !user) {
            set({ partner: null, partnerUser: null, isAuthenticated: false, isLoading: false })
            return
          }

          // Get partner_user by auth_user_id
          const { data: partnerUser, error: puError } = await supabase
            .from('partner_users')
            .select('*')
            .eq('auth_user_id', user.id)
            .eq('is_active', true)
            .maybeSingle()

          if (puError || !partnerUser) {
            console.log('No active partner user found')
            set({ partner: null, partnerUser: null, isAuthenticated: false, isLoading: false })
            return
          }

          // Get partner info
          const { data: partner, error: pError } = await supabase
            .from('partners')
            .select('*')
            .eq('id', partnerUser.partner_id)
            .single()

          if (pError || !partner) {
            console.log('Partner not found')
            set({ partner: null, partnerUser: null, isAuthenticated: false, isLoading: false })
            return
          }

          // Check partner status
          if (partner.status === 'suspended') {
            set({ 
              partner: null, 
              partnerUser: null, 
              isAuthenticated: false, 
              isLoading: false,
              error: 'Tài khoản đại lý đã bị tạm ngưng'
            })
            return
          }

          set({
            partner,
            partnerUser,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })
        } catch (error) {
          console.error('Error checking auth:', error)
          set({ partner: null, partnerUser: null, isAuthenticated: false, isLoading: false })
        }
      },

      // Login with email/password
      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })

        try {
          // Sign in with Supabase Auth
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (authError) {
            set({ isLoading: false, error: 'Email hoặc mật khẩu không đúng' })
            return { success: false, error: 'Email hoặc mật khẩu không đúng' }
          }

          if (!authData.user) {
            set({ isLoading: false, error: 'Không thể đăng nhập' })
            return { success: false, error: 'Không thể đăng nhập' }
          }

          // Get partner_user
          const { data: partnerUser, error: puError } = await supabase
            .from('partner_users')
            .select('*')
            .eq('auth_user_id', authData.user.id)
            .maybeSingle()

          if (puError || !partnerUser) {
            await supabase.auth.signOut()
            set({ isLoading: false, error: 'Tài khoản không phải đại lý' })
            return { success: false, error: 'Tài khoản không phải đại lý' }
          }

          // Check user is_active
          if (!partnerUser.is_active) {
            await supabase.auth.signOut()
            set({ isLoading: false, error: 'Tài khoản đã bị khóa' })
            return { success: false, error: 'Tài khoản đã bị khóa' }
          }

          // Get partner info
          const { data: partner, error: pError } = await supabase
            .from('partners')
            .select('*')
            .eq('id', partnerUser.partner_id)
            .single()

          if (pError || !partner) {
            await supabase.auth.signOut()
            set({ isLoading: false, error: 'Không tìm thấy thông tin đại lý' })
            return { success: false, error: 'Không tìm thấy thông tin đại lý' }
          }

          // Check partner status
          if (partner.status === 'suspended') {
            await supabase.auth.signOut()
            set({ isLoading: false, error: 'Tài khoản đại lý đã bị tạm ngưng' })
            return { success: false, error: 'Tài khoản đại lý đã bị tạm ngưng' }
          }

          set({
            partner,
            partnerUser,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          })

          return { success: true }
        } catch (error) {
          console.error('Login error:', error)
          set({ isLoading: false, error: 'Có lỗi xảy ra. Vui lòng thử lại.' })
          return { success: false, error: 'Có lỗi xảy ra. Vui lòng thử lại.' }
        }
      },

      // Logout
      logout: async () => {
        try {
          await supabase.auth.signOut()
        } catch (error) {
          console.error('Logout error:', error)
        } finally {
          set({
            partner: null,
            partnerUser: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
          })
        }
      },

      // Setters
      setPartner: (partner) => set({ partner }),
      setPartnerUser: (partnerUser) => set({ partnerUser }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'partner-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        partner: state.partner,
        partnerUser: state.partnerUser,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

// ============================================================================
// HELPER HOOKS
// ============================================================================

export const usePartner = () => {
  const partner = usePartnerAuthStore((state) => state.partner)
  return partner
}

export const usePartnerUser = () => {
  const partnerUser = usePartnerAuthStore((state) => state.partnerUser)
  return partnerUser
}

export const useIsPartnerAuthenticated = () => {
  const isAuthenticated = usePartnerAuthStore((state) => state.isAuthenticated)
  return isAuthenticated
}