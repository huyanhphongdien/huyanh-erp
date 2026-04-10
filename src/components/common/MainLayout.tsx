// ============================================================
// MAIN LAYOUT - UPDATED FOR MODERN REDESIGN
// File: src/components/common/MainLayout.tsx
// ============================================================

import { Suspense, lazy } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

const AIChatWidget = lazy(() => import('../../features/ai-chat/AIChatWidget'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
    </div>
  )
}

export function MainLayout() {
  return (
    <div className="flex min-h-screen" style={{ background: '#F0EDE8' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto lg:pt-0 pt-[calc(3.5rem+var(--safe-top))] pb-safe">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <AIChatWidget />
      </Suspense>
    </div>
  )
}
