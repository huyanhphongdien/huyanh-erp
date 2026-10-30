// ============================================================================
// useIsPhone / usePhoneRedirect — trang ERP (bảng antd, menu trái) mở trên điện thoại
// thì chuyển sang màn mobile tương ứng. Thêm ?pc=1 vào URL để giữ bản máy tính.
// File: src/hooks/useIsPhone.ts
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const QUERY = '(max-width: 640px)'

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState<boolean>(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const m = window.matchMedia(QUERY)
    const h = () => setPhone(m.matches)
    m.addEventListener('change', h)
    return () => m.removeEventListener('change', h)
  }, [])
  return phone
}

export function usePhoneRedirect(target: string | null) {
  const phone = useIsPhone()
  const navigate = useNavigate()
  useEffect(() => {
    if (!phone || !target) return
    if (new URLSearchParams(window.location.search).get('pc') === '1') return
    try { if (sessionStorage.getItem('kho_pc') === '1') return } catch { /* bỏ qua */ }
    navigate(target, { replace: true })
  }, [phone, target, navigate])
}
