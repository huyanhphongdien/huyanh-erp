// ============================================================================
// AUTH STORE — Đăng nhập PIN cho app Cân mủ lẻ
// File: apps/retail-scale/src/stores/authStore.ts
//
// Dùng chung bảng `scale_operators` với app cân xe. Key localStorage RIÊNG
// ('rs_operator') để 2 app không đá nhau khi chạy dev cùng máy.
// ============================================================================

import { create } from 'zustand'
import { supabase } from '@erp/lib/supabase'

export interface ScaleOperator {
  id: string
  name: string
  station: string
  is_active: boolean
}

const STORAGE_KEY = 'rs_operator'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 giờ — hết ca thì phải đăng nhập lại

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
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return null
      const parsed = JSON.parse(saved)
      if (parsed._loginAt && Date.now() - parsed._loginAt > SESSION_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY)
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

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...operator, _loginAt: Date.now() }))
      set({ operator, loading: false })
      return true
    } catch {
      set({ loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY)
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
