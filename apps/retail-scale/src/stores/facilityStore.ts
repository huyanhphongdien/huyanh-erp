// ============================================================================
// FACILITY STORE — App Cân mủ lẻ (multi-facility)
// File: apps/retail-scale/src/stores/facilityStore.ts
//
// Mỗi instance app chỉ phục vụ 1 nhà máy, set qua env:
//   VITE_FACILITY_CODE=PD   → Phong Điền (mặc định)
//   VITE_FACILITY_CODE=TL   → Tân Lâm
//   VITE_FACILITY_CODE=LAO  → Lào
//
// Giống hệt apps/weighbridge — giữ nguyên để 2 app hành xử nhất quán.
// ============================================================================

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { supabase } from '@erp/lib/supabase'

interface FacilityInfo {
  id: string
  code: string
  name: string
  country: string
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

export function getFacilityCode(): string {
  return (import.meta.env.VITE_FACILITY_CODE || 'PD').toUpperCase()
}

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
      .select('id, code, name, country')
      .eq('code', code)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setError(`Không load được nhà máy ${code}: ${error.message}`)
        } else if (!data) {
          setError(`Không tìm thấy nhà máy có mã = ${code}. Kiểm tra VITE_FACILITY_CODE.`)
        } else {
          setFacility(data as FacilityInfo)
        }
        setLoading(false)
        setBootstrapped(true)
      })
  }, [facility, bootstrapped, setFacility, setLoading, setError])

  return { facility, loading, error }
}

/** Lấy facility_id (sync) — yêu cầu đã bootstrap qua useCurrentFacility trước đó. */
export function getCurrentFacilityId(): string | null {
  return useFacilityStore.getState().facility?.id || null
}
