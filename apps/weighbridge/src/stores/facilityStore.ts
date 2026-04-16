// ============================================================================
// FACILITY STORE — Multi-facility weighbridge sub-app (F2)
// File: apps/weighbridge/src/stores/facilityStore.ts
//
// Mỗi instance app cân chỉ phục vụ 1 nhà máy duy nhất, được set qua env var:
//   VITE_FACILITY_CODE=PD   → Phong Điền (mặc định)
//   VITE_FACILITY_CODE=TL   → Tân Lâm
//   VITE_FACILITY_CODE=LAO  → Lào
//
// Hook resolve code → facility_id từ Supabase, cache vào memory.
// ============================================================================

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { supabase } from '@erp/lib/supabase'

interface FacilityInfo {
  id: string
  code: string
  name: string
  country: string
  weighbridge_subdomain?: string | null
}

interface FacilityStoreState {
  facility: FacilityInfo | null
  loading: boolean
  error: string | null
  setFacility: (f: FacilityInfo | null) => void
  setLoading: (l: boolean) => void
  setError: (e: string | null) => void
}

const useFacilityStore = create<FacilityStoreState>((set) => ({
  facility: null,
  loading: false,
  error: null,
  setFacility: (facility) => set({ facility }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}))

/**
 * Get facility code từ env (default 'PD' nếu không set — backward compat).
 */
export function getFacilityCode(): string {
  return (import.meta.env.VITE_FACILITY_CODE || 'PD').toUpperCase()
}

/**
 * Hook: load facility info 1 lần, cache vào zustand store.
 * Trả về { facility, loading, error }.
 */
export function useCurrentFacility() {
  const { facility, loading, error, setFacility, setLoading, setError } = useFacilityStore()
  const [bootstrapped, setBootstrapped] = useState(!!facility)

  useEffect(() => {
    if (facility || bootstrapped) return
    const code = getFacilityCode()
    setLoading(true)
    setError(null)
    supabase
      .from('facilities')
      .select('id, code, name, country, weighbridge_subdomain')
      .eq('code', code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setError(`Không load được facility ${code}: ${error.message}`)
        } else if (!data) {
          setError(`Không tìm thấy facility với code = ${code}. Kiểm tra VITE_FACILITY_CODE.`)
        } else {
          setFacility(data as FacilityInfo)
        }
        setLoading(false)
        setBootstrapped(true)
      })
  }, [facility, bootstrapped, setFacility, setLoading, setError])

  return { facility, loading, error }
}

/** Helper: lấy facility_id (sync) — yêu cầu đã bootstrap trước. */
export function getCurrentFacilityId(): string | null {
  return useFacilityStore.getState().facility?.id || null
}
