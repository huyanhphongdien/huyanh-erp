import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Button, Input, Card } from '../../components/ui'

export function RegisterPage() {
  const navigate = useNavigate()
  const { register, isLoading, error, clearError } = useAuthStore()

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    setFormError('')

    if (formData.password !== formData.confirmPassword) {
      setFormError('Mật khẩu xác nhận không khớp')
      return
    }

    if (formData.password.length < 6) {
      setFormError('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }

    const result = await register({
      email: formData.email,
      password: formData.password,
      full_name: formData.full_name,
      phone: formData.phone,
    })

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
            Chúng tôi đã gửi email xác nhận đến <strong>{formData.email}</strong>.
            Vui lòng click vào link trong email để kích hoạt tài khoản.
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
            🏭 Huy Anh ERP
          </h1>
          <p className="text-gray-600 mt-2">Đăng ký tài khoản mới</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Họ và tên"
            name="full_name"
            placeholder="Nguyễn Văn A"
            value={formData.full_name}
            onChange={handleChange}
            required
          />

          <Input
            label="Email"
            type="email"
            name="email"
            placeholder="email@company.com"
            value={formData.email}
            onChange={handleChange}
            required
          />

          <Input
            label="Số điện thoại"
            type="tel"
            name="phone"
            placeholder="0901234567"
            value={formData.phone}
            onChange={handleChange}
          />

          <Input
            label="Mật khẩu"
            type="password"
            name="password"
            placeholder="Tối thiểu 6 ký tự"
            value={formData.password}
            onChange={handleChange}
            required
          />

          <Input
            label="Xác nhận mật khẩu"
            type="password"
            name="confirmPassword"
            placeholder="Nhập lại mật khẩu"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />

          {(error || formError) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-danger">{error || formError}</p>
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Đăng ký
          </Button>
        </form>

        <p className="text-center mt-6 text-gray-600">
          Đã có tài khoản?{' '}
          <Link to="/login" className="text-primary hover:underline font-medium">
            Đăng nhập
          </Link>
        </p>
      </Card>
    </div>
  )
}