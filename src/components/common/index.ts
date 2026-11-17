// ============================================================
// COMMON COMPONENTS INDEX
// File: src/components/common/index.ts
// ============================================================
// 17/11/2026 (Đợt 3 audit UI): gỡ Header + 2 chuông NotificationBell/TaskNotificationBell — chết từ lâu
// (MainLayout chỉ render Sidebar + Outlet, 0 nơi import). Thông báo: menu TỔNG QUAN → Thông báo
// (badge đếm) + chuông trên thanh điện thoại trong Sidebar.

export { MainLayout } from './MainLayout';
export { Sidebar } from './Sidebar';
export { ErrorBoundary } from './ErrorBoundary';
