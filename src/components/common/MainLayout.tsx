// ============================================================
// MAIN LAYOUT - UPDATED FOR MODERN REDESIGN
// File: src/components/common/MainLayout.tsx
// ============================================================

import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import TabbedWorkspace from './TabbedWorkspace'
import { useB2BDealToasts } from '../../hooks/useB2BDealToasts'
// Side-effect import: đăng ký tất cả tab components vào registry
// để tabs có thể restore sau khi user F5 reload
import '../../lib/tabRegistry'

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
    </div>
  )
}

export function MainLayout() {
  // Global realtime toast cho b2b_deals UPDATE (QC xong, accepted, settled...)
  useB2BDealToasts(true)

  return (
    <div className="flex min-h-screen" style={{ background: '#F0EDE8' }}>
      <Sidebar />
      <main className="flex-1 overflow-hidden lg:pt-0 pt-[calc(3.5rem+var(--safe-top))] pb-safe flex flex-col">
        {/* TabbedWorkspace: khi có tabs → hiện tab bar + keep-alive content,
            khi không có tabs → chỉ render Outlet như layout thường */}
        <TabbedWorkspace>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </TabbedWorkspace>
      </main>
    </div>
  )
}
