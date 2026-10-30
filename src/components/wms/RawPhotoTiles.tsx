// ============================================================================
// RawPhotoTiles — 3 ô ảnh chứng từ (toàn cảnh*, màn hình cân*, bổ sung)
// File: src/components/wms/RawPhotoTiles.tsx
// Không dùng antd để chạy được cả màn mobile (.ops-*) lẫn desktop.
// Chụp bằng <input type="file" capture="environment"> → rawPhotoService.upload.
// ============================================================================

import { useRef, useState } from 'react'
import { rawPhotoService, RAW_PHOTO_KIND_LABELS, type RawPhoto, type RawPhotoKind, type RawPhotoRefType } from '../../services/wms/rawPhotoService'

const KINDS: RawPhotoKind[] = ['toan_canh', 'man_hinh_can', 'bo_sung']

export interface RawPhotoTilesProps {
  refType: RawPhotoRefType
  refId: string
  photos: RawPhoto[]
  required?: string[]
  facilityCode?: string
  disabled?: boolean
  onChange: () => void
  size?: number
}

export default function RawPhotoTiles({ refType, refId, photos, required = ['toan_canh', 'man_hinh_can'], facilityCode, disabled, onChange, size = 96 }: RawPhotoTilesProps) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const [busy, setBusy] = useState<RawPhotoKind | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const pick = async (kind: RawPhotoKind, files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setBusy(kind); setErr(null)
    try { await rawPhotoService.upload(f, { refType, refId, kind, facilityCode }); onChange() }
    catch (e: any) { setErr(e?.message || 'Tải ảnh thất bại') }
    finally { setBusy(null); const el = inputs.current[kind]; if (el) el.value = '' }
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {KINDS.map((kind) => {
          const mine = photos.filter((p) => p.kind === kind)
          const last = mine[mine.length - 1]
          const isReq = required.includes(kind)
          const missing = isReq && mine.length === 0
          return (
            <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button type="button" disabled={disabled || busy !== null} onClick={() => inputs.current[kind]?.click()}
                aria-label={`${RAW_PHOTO_KIND_LABELS[kind]}${last ? ', đã chụp, bấm để chụp lại' : ', chưa chụp, bấm để chụp'}`}
                style={{
                  height: size, padding: 0, borderRadius: 10, overflow: 'hidden', cursor: disabled ? 'default' : 'pointer', position: 'relative',
                  border: last ? '1px solid #2D8B6E' : missing ? '2px dashed #DC2626' : '1px dashed #9CA3AF',
                  background: last ? '#E8F5F0' : '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {last?.public_url ? (
                  <img src={last.public_url} alt={RAW_PHOTO_KIND_LABELS[kind]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={missing ? '#B91C1C' : '#6B7280'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                )}
                {busy === kind && <span style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>đang tải…</span>}
                {mine.length > 1 && <span style={{ position: 'absolute', top: 4, right: 6, fontSize: 11, background: '#1B4D3E', color: '#fff', borderRadius: 999, padding: '0 6px' }}>{mine.length}</span>}
              </button>
              <div style={{ fontSize: 11, lineHeight: 1.3 }}>
                <b>{KINDS.indexOf(kind) + 1} · {RAW_PHOTO_KIND_LABELS[kind]}</b>{isReq && <span style={{ color: '#B91C1C' }}> *</span>}
                <div style={{ color: last ? '#15803D' : missing ? '#B91C1C' : '#6B7280' }}>
                  {last ? `${new Date(last.taken_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · đã chụp` : isReq ? 'chưa chụp' : 'tùy chọn'}
                </div>
              </div>
              <input ref={(el) => { inputs.current[kind] = el }} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => pick(kind, e.target.files)} />
            </div>
          )
        })}
      </div>
      {err && <div style={{ color: '#B91C1C', fontSize: 12, marginTop: 6 }}>{err}</div>}
    </div>
  )
}
