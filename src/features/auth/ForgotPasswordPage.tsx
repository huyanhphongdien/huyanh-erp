import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Button, Input, Card } from '../../components/ui'

export function ForgotPasswordPage() {
  const { forgotPassword, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    const result = await forgotPassword(email)
    if (result) {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <div className="text-6xl mb-4">📧</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">
            Kiểm tra email của bạn
          </h2>
          <p className="text-gray-600 mb-6">
            Nếu email <strong>{email}</strong> tồn tại trong hệ thống,
            bạn sẽ nhận được link đặt lại mật khẩu.
          </p>
          <Link to="/login">
            <Button variant="outline">Quay lại đăng nhập</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary">
            🔑 Quên mật khẩu
          </h1>
          <p className="text-gray-600 mt-2">
            Nhập email để nhận link đặt lại mật khẩu
          </p>
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

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Gửi link đặt lại mật khẩu
          </Button>
        </form>

        <p className="text-center mt-6 text-gray-600">
          <Link to="/login" className="text-primary hover:underline">
            ← Quay lại đăng nhập
          </Link>
        </p>
      </Card>
    </div>
  )
}