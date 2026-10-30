// ============================================================================
// KHO NGUYÊN LIỆU MỦ — ảnh chứng từ (GĐ4)
// File: src/services/wms/rawPhotoService.ts
// Nén ảnh (lib/imageCompress, ≤1600px) → bucket raw-photos → dòng raw_photos
// (kind toan_canh | man_hinh_can | bo_sung, giờ, GPS nếu cho phép, người chụp).
// ============================================================================

import { supabase } from '../../lib/supabase'
import { compressImage } from '../../lib/imageCompress'

export type RawPhotoKind = 'toan_canh' | 'man_hinh_can' | 'bo_sung'
export type RawPhotoRefType = 'mix_issue_out' | 'mix_issue_return' | 'mix_lot' | 'raw_issue' | 'stocktake' | 'raw_recheck'

export interface RawPhoto {
  id: string
  ref_type: RawPhotoRefType
  ref_id: string
  kind: RawPhotoKind
  storage_path: string
  public_url: string | null
  taken_at: string
  gps_lat: number | null
  gps_lng: number | null
  taken_by: string | null
  note: string | null
}

export const RAW_PHOTO_KIND_LABELS: Record<RawPhotoKind, string> = { toan_canh: 'Toàn cảnh', man_hinh_can: 'Màn hình cân', bo_sung: 'Bổ sung' }

function getGps(timeoutMs = 4000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    const t = setTimeout(() => resolve(null), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { clearTimeout(t); resolve(null) },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 120000 },
    )
  })
}

export const rawPhotoService = {
  async list(refType: RawPhotoRefType, refId: string): Promise<RawPhoto[]> {
    const { data, error } = await supabase.from('raw_photos').select('*').eq('ref_type', refType).eq('ref_id', refId).order('taken_at')
    if (error) throw error
    return (data ?? []) as RawPhoto[]
  },

  async listMany(refType: RawPhotoRefType, refIds: string[]): Promise<Record<string, RawPhoto[]>> {
    if (!refIds.length) return {}
    const { data, error } = await supabase.from('raw_photos').select('*').eq('ref_type', refType).in('ref_id', refIds).order('taken_at')
    if (error) throw error
    const out: Record<string, RawPhoto[]> = {}
    for (const p of (data ?? []) as RawPhoto[]) (out[p.ref_id] ??= []).push(p)
    return out
  },

  /** Chụp / chọn ảnh → nén → tải lên → ghi dòng. facilityCode chỉ để xếp thư mục. */
  async upload(file: File, opts: { refType: RawPhotoRefType; refId: string; kind: RawPhotoKind; facilityCode?: string; note?: string }): Promise<RawPhoto> {
    const compressed = await compressImage(file, { maxDim: 1600, quality: 0.72 })
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const path = `${(opts.facilityCode || 'XX').toUpperCase()}/${ym}/${opts.refType}/${opts.refId}/${opts.kind}-${now.getTime()}.jpg`
    const { error: upErr } = await supabase.storage.from('raw-photos').upload(path, compressed, { contentType: compressed.type || 'image/jpeg', upsert: false })
    if (upErr) throw new Error(`Tải ảnh lên thất bại: ${upErr.message}`)
    const publicUrl = supabase.storage.from('raw-photos').getPublicUrl(path).data.publicUrl

    const [{ data: { user } }, gps] = await Promise.all([supabase.auth.getUser(), getGps()])
    let takenBy: string | null = null
    if (user) {
      const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
      takenBy = me?.id ?? null
    }
    const { data, error } = await supabase.from('raw_photos').insert({
      ref_type: opts.refType, ref_id: opts.refId, kind: opts.kind, storage_path: path, public_url: publicUrl,
      taken_at: now.toISOString(), gps_lat: gps?.lat ?? null, gps_lng: gps?.lng ?? null, taken_by: takenBy, note: opts.note ?? null,
    }).select('*').single()
    if (error) throw error
    return data as RawPhoto
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('raw_photos').delete().eq('id', id)
    if (error) throw error
  },

  /** Thiếu loại ảnh nào trong danh sách bắt buộc */
  missing(photos: RawPhoto[], required: string[]): RawPhotoKind[] {
    return required.filter((k) => !photos.some((p) => p.kind === k)) as RawPhotoKind[]
  },
}

export default rawPhotoService
