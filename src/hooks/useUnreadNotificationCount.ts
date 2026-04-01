import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { countUnread } from '../services/notificationHelper'

export function useUnreadNotificationCount() {
  const { user } = useAuthStore()
  const { data: count = 0 } = useQuery({
    queryKey: ['unread-notification-count', user?.employee_id],
    queryFn: () => countUnread(user!.employee_id!),
    enabled: !!user?.employee_id,
    refetchInterval: 30000,
    staleTime: 15000,
  })
  return count
}
