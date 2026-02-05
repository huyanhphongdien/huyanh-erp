// ============================================================
// MAIN LAYOUT COMPONENT
// File: src/components/common/Layout.tsx
// ============================================================

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function MainLayout() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      {/* pt-14: clear mobile fixed header (h-14 = 56px), lg:pt-0: no padding on desktop */}
      <main className="flex-1 overflow-auto pt-14 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

export default MainLayout;