import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import LoginPage from '@/pages/LoginPage'
import HomePage from '@/pages/HomePage'
import WeighingPage from '@/pages/WeighingPage'
import PrintPage from '@/pages/PrintPage'
import SettingsPage from '@/pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const operator = useAuthStore((s) => s.operator)
  if (!operator) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/weigh"
          element={
            <ProtectedRoute>
              <WeighingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/weigh/:ticketId"
          element={
            <ProtectedRoute>
              <WeighingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/print/:ticketId"
          element={
            <ProtectedRoute>
              <PrintPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
