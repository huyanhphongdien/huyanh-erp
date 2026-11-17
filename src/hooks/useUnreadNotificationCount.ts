import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { countUnread } from '../services/notificationHelper'

/**
 * Số thông báo chưa đọc của người đang đăng nhập (badge menu 'Thông báo' + chuông thanh điện thoại).
 * Key ['notification-count', employee_id] — trang Thông báo (NotificationPage.invalidateAll) invalidate
 * đúng tiền tố này nên bấm "Đọc hết"/"Xoá" xong badge cập nhật ngay, không đợi 30s.
 */
export function useUnreadNotificationCount() {
  const { user } = useAuthStore()
  const { data: count = 0 } = useQuery({
    queryKey: ['notification-count', user?.employee_id],
    queryFn: () => countUnread(user!.employee_id!),
    enabled: !!user?.employee_id,
    refetchInterval: 30000,
    staleTime: 15000,
  })
  return count
}
