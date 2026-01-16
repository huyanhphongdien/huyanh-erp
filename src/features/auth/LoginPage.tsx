import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Button, Input, Card } from '../../components/ui'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError, isAuthenticated } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Xóa lỗi cũ khi vào trang
  useEffect(() => {
    clearError()
  }, [clearError])

  // Tự động chuyển trang khi đã đăng nhập
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    await login({ email, password })
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">
            🏭 Huy Anh ERP
          </h1>
          <p className="text-gray-600 mt-2">Đăng nhập vào hệ thống</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Mật khẩu"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="text-right">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Quên mật khẩu?
            </Link>
          </div>

          <Button
            type="submit"
            className="w-full"
            isLoading={isLoading}
          >
            Đăng nhập
          </Button>
        </form>

        <p className="text-center mt-6 text-gray-600">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="text-primary hover:underline font-medium">
            Đăng ký ngay
          </Link>
        </p>
      </Card>
    </div>
  )
}