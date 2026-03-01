// ============================================================
// MAIN LAYOUT - UPDATED FOR MODERN REDESIGN
// File: src/components/common/MainLayout.tsx
// ============================================================

import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function MainLayout() {
  return (
    <div className="flex min-h-screen" style={{ background: '#F0EDE8' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto lg:pt-0 pt-14">
        <Outlet />
      </main>
    </div>
  )
}