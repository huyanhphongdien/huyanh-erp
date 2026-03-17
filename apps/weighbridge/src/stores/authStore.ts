import { create } from 'zustand'
import { supabase } from '@erp/lib/supabase'

export interface ScaleOperator {
  id: string
  name: string
  station: string
  is_active: boolean
}

interface AuthState {
  operator: ScaleOperator | null
  loading: boolean
  login: (operatorId: string, pin: string) => Promise<boolean>
  logout: () => void
  getOperators: () => Promise<ScaleOperator[]>
}

export const useAuthStore = create<AuthState>((set) => ({
  operator: (() => {
    try {
      const saved = localStorage.getItem('wb_operator')
      if (!saved) return null
      const parsed = JSON.parse(saved)
      // Auto-logout after 12 hours
      if (parsed._loginAt && Date.now() - parsed._loginAt > 12 * 60 * 60 * 1000) {
        localStorage.removeItem('wb_operator')
        return null
      }
      return parsed
    } catch {
      return null
    }
  })(),
  loading: false,

  login: async (operatorId: string, pin: string) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('scale_operators')
        .select('id, name, station, is_active, pin_code')
        .eq('id', operatorId)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        set({ loading: false })
        return false
      }

      // Simple PIN check (plaintext for now, can hash later)
      if (data.pin_code !== pin) {
        set({ loading: false })
        return false
      }

      const operator: ScaleOperator = {
        id: data.id,
        name: data.name,
        station: data.station,
        is_active: data.is_active,
      }

      localStorage.setItem('wb_operator', JSON.stringify({ ...operator, _loginAt: Date.now() }))
      set({ operator, loading: false })
      return true
    } catch {
      set({ loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('wb_operator')
    set({ operator: null })
  },

  getOperators: async () => {
    const { data, error } = await supabase
      .from('scale_operators')
      .select('id, name, station, is_active')
      .eq('is_active', true)
      .order('name')

    if (error) return []
    return (data || []) as ScaleOperator[]
  },
}))
