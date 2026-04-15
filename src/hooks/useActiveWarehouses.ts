// ============================================================================
// useActiveWarehouses — shared React Query hook cho danh sách kho active
// File: src/hooks/useActiveWarehouses.ts
// ============================================================================
// Mọi consumer (WarehousePicker, StockIn/Out Create page, ...) dùng chung
// queryKey ['wms-warehouses-active'] → 1 network call duy nhất cho cả app.
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { warehouseService } from '../services/wms'
import type { Warehouse } from '../services/wms'

export const WAREHOUSES_ACTIVE_QUERY_KEY = ['wms-warehouses-active'] as const

export function useActiveWarehouses() {
  return useQuery<Warehouse[]>({
    queryKey: WAREHOUSES_ACTIVE_QUERY_KEY,
    queryFn: () => warehouseService.getAllActive(),
    staleTime: 5 * 60 * 1000,
  })
}
