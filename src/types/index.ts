// ==========================================
// USER & AUTH TYPES
// ==========================================

// Thông tin người dùng
export interface User {
  id: string
  email: string
  full_name?: string      // Họ tên (có thể không có)
  avatar_url?: string     // Ảnh đại diện
  phone?: string          // Số điện thoại
  department_id?: string  // Phòng ban
  role?: UserRole         // Vai trò
  created_at?: string
  updated_at?: string
}

// Các vai trò trong hệ thống
export type UserRole = 'admin' | 'manager' | 'employee'

// Dữ liệu đăng nhập
export interface LoginCredentials {
  email: string
  password: string
}

// Dữ liệu đăng ký
export interface RegisterCredentials {
  email: string
  password: string
  full_name: string
  phone?: string
}

// Trạng thái Auth Store
export interface AuthState {
  user: User | null           // Người dùng hiện tại
  isLoading: boolean          // Đang tải?
  isAuthenticated: boolean    // Đã đăng nhập?
  error: string | null        // Lỗi (nếu có)
}

// ==========================================
// COMMON TYPES
// ==========================================

// Response từ API
export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}
