// ============================================================================
// useRawRole — quyền của người đang đăng nhập trong kho nguyên liệu mủ (GĐ0)
// File: src/hooks/useRawRole.ts
//
// Hỏi DB một lần cho mỗi (user, facility) qua fn_nvl_quyen rồi cache trong
// module. Khác useIsB2BPurchaser: KHÔNG có email cứng — luật nằm ở DB.
// Dùng để ẩn/hiện menu và nút; trước khi GHI vẫn gọi rawAccessService.canSign().
// ============================================================================

import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { rawAccessService } from '../services/wms/rawAccessService'
import { RAW_PERMISSIONS_NONE, type RawPermissions } from '../services/wms/raw.types'

interface RawRole {
  loading: boolean
  perms: RawPermissions
  /** Có trong raw_store_keepers (cho nhà máy đang xem) */
  isKeeper: boolean
  isQC: boolean
  isBGD: boolean
  /** Thấy được module kho NVL: BGĐ, thủ kho, QC */
  canSeeRaw: boolean
  refresh: () => void
}

const cache = new Map<string, RawPermissions>()
const inflight = new Map<string, Promise<RawPermissions>>()

function load(key: string, facilityId: string | null): Promise<RawPermissions> {
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const pending = inflight.get(key)
  if (pending) return pending
  const p = rawAccessService
    .getPermissions(facilityId)
    .then((perms) => { cache.set(key, perms); return perms })
    .catch(() => RAW_PERMISSIONS_NONE)
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

export function useRawRole(facilityId: string | null = null): RawRole {
  const user = useAuthStore((s) => s.user)
  const key = `${user?.id ?? 'anon'}|${facilityId ?? '*'}`
  const [perms, setPerms] = useState<RawPermissions>(() => cache.get(key) ?? RAW_PERMISSIONS_NONE)
  const [loading, setLoading] = useState<boolean>(() => !cache.has(key) && !!user)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) { setPerms(RAW_PERMISSIONS_NONE); setLoading(false); return }
    let alive = true
    setLoading(!cache.has(key))
    load(key, facilityId).then((p) => { if (alive) { setPerms(p); setLoading(false) } })
    return () => { alive = false }
  }, [key, user, facilityId, tick])

  const isBGD = perms.la_bgd
  return {
    loading,
    perms,
    isKeeper: perms.la_thu_kho,
    isQC: perms.la_qc,
    isBGD,
    canSeeRaw: isBGD || perms.la_thu_kho || perms.la_qc,
    refresh: () => { cache.delete(key); setTick((t) => t + 1) },
  }
}
