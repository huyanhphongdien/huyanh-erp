// useUnsavedWarning — cảnh báo trình duyệt khi ĐÓNG TAB / F5 lúc form còn dữ liệu chưa lưu.
// (Audit 17/11/2026: toàn hệ không có cảnh báo rời trang.) Chỉ phủ beforeunload;
// chuyển route trong SPA không chặn được vì app dùng BrowserRouter thường (không data router)
// — TabbedWorkspace đã lo cảnh báo tab dirty riêng.
// Dùng: useUnsavedWarning(coThayDoiChuaLuu) — gọi vô điều kiện, truyền cờ dirty.
import { useEffect } from 'react'

export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
}

export default useUnsavedWarning
