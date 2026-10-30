// ============================================================================
// useMixRole — quyền của người đang đăng nhập trong QUY TRÌNH HÀNG CHÈN (30/10/2026):
//   khai_bao (QS: nhập lô chèn, lấy, trả, ký bước 1) · duyet_qc (QC, bước 2) · nhan_kho (thủ kho nhận, bước 3 — tạm thời chủ DN)
// Luật nằm ở DB (fn_mix_duoc_ky / bảng mix_signers); hook chỉ hỏi fn_mix_quyen một lần cho mỗi (user, facility).
// File: src/hooks/useMixRole.ts
// ============================================================================
import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { mixService, MIX_QUYEN_NONE, type MixQuyen } from '../services/wms/mixService'

export interface MixRole {
  loading: boolean
  quyen: MixQuyen
  /** Bước 1: QS được phân công (hoặc BGĐ) — nhập lô chèn, lấy đầu ca, trả cuối ca, ký khai báo */
  khaiBao: boolean
  /** Bước 2: QC được phân công (hoặc BGĐ) */
  duyetQc: boolean
  /** Bước 3: thủ kho được phân công (hoặc BGĐ level ≤ 3) */
  nhanKho: boolean
  laBgd: boolean
  daPhanCong: MixQuyen['da_phan_cong']
  refresh: () => void
}

const cache = new Map<string, MixQuyen>()
const inflight = new Map<string, Promise<MixQuyen>>()

function load(key: string, facilityId: string | null): Promise<MixQuyen> {
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = mixService.quyen(facilityId)
    .then((q) => { cache.set(key, q); return q })
    .catch(() => MIX_QUYEN_NONE)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function useMixRole(facilityId: string | null = null): MixRole {
  const user = useAuthStore((s) => s.user)
  const key = `${user?.id ?? 'anon'}|${facilityId ?? '*'}`
  const [quyen, setQuyen] = useState<MixQuyen>(() => cache.get(key) ?? MIX_QUYEN_NONE)
  const [loading, setLoading] = useState<boolean>(() => !cache.has(key) && !!user)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) { setQuyen(MIX_QUYEN_NONE); setLoading(false); return }
    let alive = true
    setLoading(!cache.has(key))
    load(key, facilityId).then((q) => { if (alive) { setQuyen(q); setLoading(false) } })
    return () => { alive = false }
  }, [key, user, facilityId, tick])

  return {
    loading, quyen,
    khaiBao: quyen.khai_bao, duyetQc: quyen.duyet_qc, nhanKho: quyen.nhan_kho, laBgd: quyen.la_bgd,
    daPhanCong: quyen.da_phan_cong,
    refresh: () => { cache.delete(key); setTick((t) => t + 1) },
  }
}

export default useMixRole
