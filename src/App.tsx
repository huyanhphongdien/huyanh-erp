import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'

// Layout - nằm trong components/common
import { MainLayout } from './components/common/Layout'

// Auth
import { LoginPage } from './features/auth/LoginPage'

// Phase 3.1: Phòng ban, Chức vụ, Nhân viên
import { DepartmentListPage } from './features/departments'
import { PositionListPage } from './features/positions'
import { EmployeeListPage } from './features/employees'

// Phase 3.2: Hợp đồng
import { ContractTypeListPage } from './features/contract-types'
import { ContractListPage } from './features/contracts'

// Phase 3.3: Nghỉ phép, Chấm công
import { LeaveTypeListPage } from './features/leave-types'
import { LeaveRequestListPage } from './features/leave-requests'
import { AttendanceListPage } from './features/attendance'

// Phase 3.4: Lương, Đánh giá
import { SalaryGradeListPage } from './features/salary-grades'
import { PayrollPeriodListPage } from './features/payroll'
import { PayslipListPage } from './features/payslips'
import { PerformanceCriteriaListPage } from './features/performance-criteria'
import { PerformanceReviewListPage } from './features/performance-reviews'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Protected Route Component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Public Route Component (redirect if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// Auth Initializer Component
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return <>{children}</>
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard */}
              <Route index element={<DashboardPage />} />

              {/* ===== PHASE 3.1: Phòng ban, Chức vụ, Nhân viên ===== */}
              <Route path="departments" element={<DepartmentListPage />} />
              <Route path="positions" element={<PositionListPage />} />
              <Route path="employees" element={<EmployeeListPage />} />

              {/* ===== PHASE 3.2: Hợp đồng ===== */}
              <Route path="contract-types" element={<ContractTypeListPage />} />
              <Route path="contracts" element={<ContractListPage />} />

              {/* ===== PHASE 3.3: Nghỉ phép, Chấm công ===== */}
              <Route path="leave-types" element={<LeaveTypeListPage />} />
              <Route path="leave-requests" element={<LeaveRequestListPage />} />
              <Route path="attendance" element={<AttendanceListPage />} />

              {/* ===== PHASE 3.4: Lương, Đánh giá ===== */}
              <Route path="salary-grades" element={<SalaryGradeListPage />} />
              <Route path="payroll-periods" element={<PayrollPeriodListPage />} />
              <Route path="payslips" element={<PayslipListPage />} />
              <Route path="performance-criteria" element={<PerformanceCriteriaListPage />} />
              <Route path="performance-reviews" element={<PerformanceReviewListPage />} />
            </Route>

            {/* 404 */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthInitializer>
    </QueryClientProvider>
  )
}

// Simple Dashboard Page
function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">
          Xin chào, <span className="font-semibold">{user?.full_name || user?.email}</span>!
        </p>
        <p className="text-gray-500 mt-2">
          Chào mừng bạn đến với hệ thống Huy Anh ERP.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
        <StatCard title="Nhân viên" value="--" icon="👥" color="blue" link="/employees" />
        <StatCard title="Phòng ban" value="--" icon="🏢" color="green" link="/departments" />
        <StatCard title="Đơn nghỉ phép" value="--" icon="📋" color="yellow" link="/leave-requests" />
        <StatCard title="Kỳ lương" value="--" icon="💰" color="purple" link="/payroll-periods" />
      </div>
    </div>
  )
}

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  icon, 
  color, 
  link 
}: { 
  title: string
  value: string
  icon: string
  color: 'blue' | 'green' | 'yellow' | 'purple'
  link: string
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600'
  }

  return (
    <a href={link} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </a>
  )
}

export default App