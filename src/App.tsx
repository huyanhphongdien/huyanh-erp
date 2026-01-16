import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { LoginPage, RegisterPage, ForgotPasswordPage, ProtectedRoute } from './features/auth'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { Layout } from './components/common/Layout'
import { Loading } from './components/ui'

function App() {
  const { checkAuth, isLoading } = useAuthStore()

  // Kiểm tra trạng thái đăng nhập khi app khởi động
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Hiển thị loading khi đang kiểm tra
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loading size="lg" text="Đang khởi động..." />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes - Ai cũng vào được */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Protected Routes - Cần đăng nhập */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          {/* Thêm các route khác ở đây */}
        </Route>

        {/* 404 - Trang không tồn tại */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App