// ============================================================================
// FACILITY FILTER STORE — Global facility selector (multi-facility F1)
// File: src/stores/facilityFilterStore.ts
//
// Quản lý facility đang được chọn ở header — toàn bộ ERP filter theo đó.
// undefined = "Tất cả nhà máy" (BGD/admin view default).
//
// Mỗi list/dashboard component có thể đọc currentFacilityId qua hook
// useFacilityFilter() để filter query Supabase tương ứng.
// ============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface FacilityFilterState {
  /** undefined = "Tất cả nhà máy". string = facility.id cụ thể */
  currentFacilityId: string | undefined
  setCurrentFacilityId: (id: string | undefined) => void
  reset: () => void
}

export const useFacilityFilterStore = create<FacilityFilterState>()(
  persist(
    (set) => ({
      currentFacilityId: undefined,
      setCurrentFacilityId: (id) => set({ currentFacilityId: id }),
      reset: () => set({ currentFacilityId: undefined }),
    }),
    {
      name: 'wms-facility-filter',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/**
 * Convenience hook trả về { currentFacilityId, setCurrentFacilityId }.
 * Dùng trong list/dashboard:
 *   const { currentFacilityId } = useFacilityFilter()
 *   // ... .eq('facility_id', currentFacilityId) khi không undefined
 */
export function useFacilityFilter() {
  const currentFacilityId = useFacilityFilterStore((s) => s.currentFacilityId)
  const setCurrentFacilityId = useFacilityFilterStore((s) => s.setCurrentFacilityId)
  return { currentFacilityId, setCurrentFacilityId }
}
