import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { User, LoginCredentials, RegisterCredentials } from '../types'

// ==========================================
// ĐỊNH NGHĨA INTERFACE CHO STORE
// ==========================================

interface AuthStore {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null

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
interface EmployeeWithDepartment {
  id: string
  code: string | null
  full_name: string
  department_id: string | null
  position_id: string | null
  department: {
    id: string
    name: string
    manager_id: string | null
  } | null
  position: {
    id: string
    name: string
    level: number
  } | null
}

async function getEmployeeByUserId(userId: string): Promise<EmployeeWithDepartment | null> {
  try {
    // ✅ FIX: Chỉ tìm theo user_id (KHÔNG tìm theo id vì id ≠ auth UUID)
    // Dùng maybeSingle() thay vì single() để tránh lỗi 406 khi không tìm thấy
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, code, full_name, department_id, position_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (empError) {
      if (empError.code !== 'PGRST116') {
        console.error('[AUTH] Error fetching employee:', empError)
      }
      return null
    }

    if (!employee) {
      return null
    }

    // Bước 2: Lấy thông tin department nếu có
    let department = null
    if (employee.department_id) {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('id, name, manager_id')
        .eq('id', employee.department_id)
        .maybeSingle()

      if (!deptError && deptData) {
        department = deptData
      }
    }

    // Bước 3: Lấy thông tin position nếu có
    let position = null
    if (employee.position_id) {
      const { data: posData, error: posError } = await supabase
        .from('positions')
        .select('id, name, level')
        .eq('id', employee.position_id)
        .maybeSingle()

      if (!posError && posData) {
        position = posData
      }
    }

    return {
      id: employee.id,
      code: employee.code,
      full_name: employee.full_name,
      department_id: employee.department_id,
      position_id: employee.position_id,
      department: department,
      position: position
    }

  } catch (error) {
    console.error('[AUTH] Error in getEmployeeByUserId:', error)
    return null
  }
}

// ==========================================
// HELPER: Xác định role của user
// ==========================================
type UserRole = 'admin' | 'manager' | 'employee'

function determineUserRole(
  userMetadata: Record<string, unknown> | undefined, 
  employee: EmployeeWithDepartment | null
): UserRole {
  // 1. Check admin từ user_metadata
  if (userMetadata?.is_admin === true || userMetadata?.role === 'admin') {
    return 'admin'
  }

  // 2. Check manager từ user_metadata
  if (
    userMetadata?.role === 'manager' || 
    userMetadata?.is_manager === true ||
    userMetadata?.is_manager === 'true'
  ) {
    return 'manager'
  }

  // 3. Check nếu employee là trưởng phòng ban
  if (employee && employee.department && employee.department.manager_id === employee.id) {
    return 'manager'
  }

  // 4. Check theo position level
  // Level 1: Giám đốc
  // Level 2: Trợ lý Giám đốc  
  // Level 3: Phó Giám đốc
  // Level 4: Trưởng phòng
  // Level 5: Phó phòng
  // Level 6: Nhân viên
  // Level 7: Thực tập sinh
  if (employee && employee.position && employee.position.level) {
    const level = employee.position.level
    // Level 1-5: Từ Phó phòng trở lên đều có quyền manager
    if (level <= 5) {
      return 'manager'
    }
  }

  // 5. Default: nhân viên
  return 'employee'
}

// ==========================================
// TẠO STORE
// ==========================================

export const useAuthStore = create<AuthStore>((set) => ({
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      })

      if (error) {
        throw error
      }

      // Lấy thông tin employee
      const employee = await getEmployeeByUserId(data.user.id)
      const role = determineUserRole(data.user.user_metadata, employee)

      const user: User = {
        id: data.user.id,
        email: data.user.email || '',
        full_name: employee?.full_name || data.user.user_metadata?.full_name as string | undefined,
        employee_id: employee?.id || null,
        employee_code: employee?.code || null,
        department_id: employee?.department_id || null,
        department_name: employee?.department?.name || null,
        position_id: employee?.position_id || null,
        position_name: employee?.position?.name || null,
        position_level: employee?.position?.level || null,
        role: role,
        is_manager: role === 'manager' || role === 'admin',
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
      const { error } = await supabase.auth.signUp({
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
        const employee = await getEmployeeByUserId(session.user.id)
        const role = determineUserRole(session.user.user_metadata, employee)

        const user: User = {
          id: session.user.id,
          email: session.user.email || '',
          full_name: employee?.full_name || session.user.user_metadata?.full_name as string | undefined,
          employee_id: employee?.id || null,
          employee_code: employee?.code || null,
          department_id: employee?.department_id || null,
          department_name: employee?.department?.name || null,
          position_id: employee?.position_id || null,
          position_name: employee?.position?.name || null,
          position_level: employee?.position?.level || null,
          role: role,
          is_manager: role === 'manager' || role === 'admin',
        }

        set({ user, isAuthenticated: true, isLoading: false })
      } else {
        set({ user: null, isAuthenticated: false, isLoading: false })
      }

    } catch (error) {
      console.error('[AUTH] checkAuth error:', error)
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  clearError: () => set({ error: null }),
}))