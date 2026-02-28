// ============================================================================
// USE PENDING LEAVE COUNT HOOK
// File: src/hooks/usePendingLeaveCount.ts
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { leaveRequestService } from '../services'
import { useAuthStore } from '../stores/authStore'

export function usePendingLeaveCount() {
  const { user } = useAuthStore()

  const { data: count = 0, isLoading } = useQuery({
    queryKey: ['pending-leave-count', user?.id],
    queryFn: async () => {
      if (!user?.id) return 0
      return await leaveRequestService.getPendingCount(user.id)
    },
    enabled: !!user?.id,
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 20000, // Consider stale after 20s
  })

  return { count, isLoading }
}