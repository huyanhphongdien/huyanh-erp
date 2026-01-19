import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User, LoginCredentials, RegisterCredentials } from '../types'

// ==========================================
// ĐỊNH NGHĨA INTERFACE CHO STORE
// ==========================================

interface AuthStore {
  // State (Trạng thái)
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null

  // Actions (Hành động)
  login: (credentials: LoginCredentials) => Promise<boolean>
  register: (credentials: RegisterCredentials) => Promise<boolean>
  logout: () => Promise<void>
  forgotPassword: (email: string) => Promise<boolean>
  checkAuth: () => Promise<void>
  clearError: () => void
}

// ==========================================
// HELPER: Lấy thông tin employee từ user_id
// ==========================================
async function getEmployeeByUserId(userId: string) {
  const { data, error } = await supabase
    .from('employees')
    .select('id, code, full_name, department_id, position_id')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching employee:', error)
    return null
  }
  return data
}

// ==========================================
// TẠO STORE
// ==========================================

export const useAuthStore = create<AuthStore>((set) => ({
  // Khởi tạo state ban đầu
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  // ------------------------------------------
  // ĐĂNG NHẬP
  // ------------------------------------------
  login: async (credentials) => {
    set({ isLoading: true, error: null })

    try {
      // Gọi Supabase Auth để đăng nhập
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) throw error

      // Lấy thông tin employee liên kết với user
      const employee = await getEmployeeByUserId(data.user.id)

      // Tạo user object với employee_id
      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        full_name: employee?.full_name || data.user.user_metadata?.full_name,
        employee_id: employee?.id,
        employee_code: employee?.code,
        department_id: employee?.department_id,
        position_id: employee?.position_id,
      }

      set({ user, isAuthenticated: true, isLoading: false })
      return true

    } catch (error: any) {
      set({
        error: error.message || 'Đăng nhập thất bại',
        isLoading: false,
      })
      return false
    }
  },

  // ------------------------------------------
  // ĐĂNG KÝ
  // ------------------------------------------
  register: async (credentials) => {
    set({ isLoading: true, error: null })

    try {
      // Gọi Supabase Auth để đăng ký
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            full_name: credentials.full_name,
            phone: credentials.phone,
          }
        }
      })

      if (error) throw error

      set({ isLoading: false })
      return true

    } catch (error: any) {
      set({
        error: error.message || 'Đăng ký thất bại',
        isLoading: false,
      })
      return false
    }
  },

  // ------------------------------------------
  // ĐĂNG XUẤT
  // ------------------------------------------
  logout: async () => {
    set({ isLoading: true })
    await supabase.auth.signOut()
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  // ------------------------------------------
  // QUÊN MẬT KHẨU
  // ------------------------------------------
  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) throw error

      set({ isLoading: false })
      return true

    } catch (error: any) {
      set({
        error: error.message || 'Không thể gửi email',
        isLoading: false,
      })
      return false
    }
  },

  // ------------------------------------------
  // KIỂM TRA TRẠNG THÁI ĐĂNG NHẬP
  // ------------------------------------------
  checkAuth: async () => {
    set({ isLoading: true })

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        // Lấy thông tin employee liên kết với user
        const employee = await getEmployeeByUserId(session.user.id)

        const user: User = {
          id: session.user.id,
          email: session.user.email || '',
          full_name: employee?.full_name || session.user.user_metadata?.full_name,
          employee_id: employee?.id,
          employee_code: employee?.code,
          department_id: employee?.department_id,
          position_id: employee?.position_id,
        }
        set({ user, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }

    } catch (error) {
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  // ------------------------------------------
  // XÓA LỖI
  // ------------------------------------------
  clearError: () => set({ error: null }),
}))