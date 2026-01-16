import { useAuthStore } from '../../stores/authStore'
import { Card } from '../../components/ui'

export function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <div>
      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Xin chào, {user?.full_name || 'Người dùng'}! 👋
        </h1>
        <p className="text-gray-600">Chào mừng bạn đến với Huy Anh ERP</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card>
          <div className="flex items-center gap-4">
            <div className="text-4xl">👥</div>
            <div>
              <p className="text-sm text-gray-500">Tổng nhân viên</p>
              <p className="text-2xl font-bold">57</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="text-4xl">📋</div>
            <div>
              <p className="text-sm text-gray-500">Công việc đang làm</p>
              <p className="text-2xl font-bold">23</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="text-4xl">✅</div>
            <div>
              <p className="text-sm text-gray-500">Hoàn thành hôm nay</p>
              <p className="text-2xl font-bold">8</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-4">
            <div className="text-4xl">⚠️</div>
            <div>
              <p className="text-sm text-gray-500">Quá hạn</p>
              <p className="text-2xl font-bold text-danger">3</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-lg font-bold mb-4">Hành động nhanh</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div className="text-2xl mb-2">➕</div>
            <div className="text-sm">Tạo công việc</div>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div className="text-2xl mb-2">👤</div>
            <div className="text-sm">Thêm nhân viên</div>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm">Xem báo cáo</div>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div className="text-2xl mb-2">⏰</div>
            <div className="text-sm">Chấm công</div>
          </button>
        </div>
      </Card>
    </div>
  )
}