// ============================================================================
// useActiveFacilities — shared React Query hook cho 3 nhà máy
// File: src/hooks/useActiveFacilities.ts
// Pattern: mirror useActiveWarehouses — single network call shared cache
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { facilityService, type Facility } from '../services/wms/facilityService'

export const FACILITIES_ACTIVE_QUERY_KEY = ['wms-facilities-active'] as const

export function useActiveFacilities() {
  return useQuery<Facility[]>({
    queryKey: FACILITIES_ACTIVE_QUERY_KEY,
    queryFn: () => facilityService.getAllActive(),
    staleTime: 10 * 60 * 1000, // 10 min — facilities ít thay đổi
  })
}
