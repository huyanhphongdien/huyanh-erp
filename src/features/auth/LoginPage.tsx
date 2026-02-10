// ============================================================
// LOGIN PAGE
// File: src/features/auth/LoginPage.tsx
// ============================================================

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Button, Card } from '../../components/ui';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showRegisterInfo, setShowRegisterInfo] = useState(false);

  // Xóa lỗi cũ khi vào trang
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Tự động chuyển trang khi đã đăng nhập
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login({ email, password });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary flex items-center justify-center gap-2">
            <span>🏭</span>
            <span className="text-[#2d7a9c]">Huy Anh ERP</span>
          </h1>
          <p className="text-gray-600 mt-2">Đăng nhập vào hệ thống</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Hiển thị lỗi */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Quên mật khẩu */}
          <div className="text-right">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-sm text-[#2d7a9c] hover:underline"
            >
              Quên mật khẩu?
            </button>
          </div>

          {/* Nút đăng nhập */}
          <Button
            type="submit"
            className="w-full bg-[#2d7a9c] hover:bg-[#246a89] text-white py-2 rounded-lg font-medium transition-colors"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Đang đăng nhập...
              </span>
            ) : (
              'Đăng nhập'
            )}
          </Button>
        </form>

        {/* Đăng ký */}
        <p className="text-center mt-6 text-gray-600">
          Chưa có tài khoản?{' '}
          <button
            type="button"
            onClick={() => setShowRegisterInfo(true)}
            className="text-[#2d7a9c] hover:underline font-medium"
          >
            Đăng ký ngay
          </button>
        </p>
      </Card>

      {/* Modal: Quên mật khẩu */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🔑</span>
              <h2 className="text-lg font-semibold">Quên mật khẩu?</h2>
            </div>
            <div className="text-gray-600 space-y-3">
              <p>Vui lòng liên hệ bộ phận IT để được hỗ trợ đặt lại mật khẩu:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>📧 Email: <span className="font-medium">it@huyanhrubber.com</span></li>
                <li>📞 Nội bộ: <span className="font-medium">100</span></li>
                <li>💬 Zalo IT Support</li>
              </ul>
              <p className="text-sm text-gray-500 mt-4">
                Lưu ý: Cung cấp họ tên, mã nhân viên và email để được xử lý nhanh chóng.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Đăng ký tài khoản */}
      {showRegisterInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">👤</span>
              <h2 className="text-lg font-semibold">Đăng ký tài khoản</h2>
            </div>
            <div className="text-gray-600 space-y-3">
              <p>
                Hệ thống <strong>Huy Anh ERP</strong> chỉ dành cho nhân viên công ty.
                Tài khoản sẽ được tạo bởi bộ phận Nhân sự khi bạn chính thức nhận việc.
              </p>
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <p className="font-medium text-blue-800 mb-1">Nhân viên mới:</p>
                <p className="text-blue-700">
                  Vui lòng liên hệ phòng Hành chính - Nhân sự để được cấp tài khoản.
                </p>
              </div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>📧 Email: <span className="font-medium">hr@huyanhrubber.com</span></li>
                <li>📞 Nội bộ: <span className="font-medium">101</span></li>
              </ul>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRegisterInfo(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LoginPage;